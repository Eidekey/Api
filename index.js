import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/saludo", async (req, res) => {
  try {
    if (req.body.tipo_solicitud !== "smoked") {
      return res.status(400).json({ error: "tipo_solicitud no reconocido" });
    }

    // ===================== FECHAS =====================
    const formatDate = (date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

    const today = new Date();

    const fecha3dias = {
      since: formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3)),
      until: formatDate(today),
    };

    const fecha7dias = {
      since: formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)),
      until: formatDate(today),
    };

    console.log("🗓 Fechas (3 días):", fecha3dias);
    console.log("🗓 Fechas (7 días):", fecha7dias);

    // ===================== VALIDACIÓN =====================
    const ad_accounts = req.body?.ad_accounts ?? [];
    if (!ad_accounts.length) {
      return res.status(400).json({ error: "No se enviaron ad_accounts" });
    }

    const token = "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD";
    const url_base = "https://graph.facebook.com/v23.0/";

    // ============================================================
    // PRIMERA LLAMADA: obtener CAMPAÑAS ACTIVAS
    // ============================================================

    let index = 0;
    let batches = [];

    while (index < ad_accounts.length) {
      const group = ad_accounts.slice(index, index + 50);
      const templateBatch = group.map((ad_account) => ({
        method: "GET",
        relative_url: `${ad_account}/campaigns?fields=id,name,effective_status,daily_budget,created_time&filtering=[{'field':'effective_status','operator':'IN','value':['ACTIVE']}]&limit=1000`,
      }));
      batches.push(templateBatch);
      index += 50;
    }

    console.log(`📦 Se generaron ${batches.length} lotes de batch requests de campañas`);

    const responsesCampaigns = await Promise.all(
      batches.map(async (batch, i) => {
        const response = await fetch(url_base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: token, batch }),
        });
        const data = await response.json();
        console.log(`Batch de campañas ${i + 1} procesado`);
        return data;
      })
    );

    const allCampaigns = responsesCampaigns.flatMap((batch) =>
      batch.flatMap((item) => {
        try {
          const parsed = JSON.parse(item.body);
          return parsed.data || [];
        } catch (err) {
          console.error("Error parseando campañas:", err);
          return [];
        }
      })
    );

    console.log(`Total campañas obtenidas: ${allCampaigns.length}`);

    // ============================================================
    // SEGUNDA LLAMADA: obtener INSIGHTS (3 DÍAS)
    // ============================================================

    async function getInsightsForRange(timeRange, label) {
      let index = 0;
      let batches = [];
      const timeRangeEncoded = encodeURIComponent(JSON.stringify(timeRange));

      while (index < ad_accounts.length) {
        const group = ad_accounts.slice(index, index + 50);
        const templateBatch = group.map((ad_account) => ({
          method: "GET",
          relative_url: `${ad_account}/insights?fields=campaign_id,adset_id,date_start,date_stop,actions,spend,impressions,clicks&time_range=${timeRangeEncoded}&level=campaign&limit=500`,
        }));
        batches.push(templateBatch);
        index += 50;
      }

      console.log(`(${label}) Se generaron ${batches.length} lotes de batch requests de insights`);

      const responsesInsights = await Promise.all(
        batches.map(async (batch, i) => {
          const response = await fetch(url_base, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: token, batch }),
          });

          const data = await response.json();
          console.log(`(${label}) Batch ${i + 1} procesado`);
          return data;
        })
      );

      const allInsights = responsesInsights.flatMap((batch) =>
        batch.flatMap((item) => {
          try {
            const parsed = JSON.parse(item.body);
            return parsed.data || [];
          } catch (err) {
            console.error(`(${label}) Error parseando insights:`, err);
            return [];
          }
        })
      );

      console.log(`(${label}) Total insights obtenidos: ${allInsights.length}`);
      return allInsights;
    }

    const insights3dias = await getInsightsForRange(fecha3dias, "3 días");
    const insights7dias = await getInsightsForRange(fecha7dias, "7 días");

    // ============================================================
    // UNIR CAMPAÑAS + INSIGHTS
    // ============================================================

    function mergeCampaignsAndInsights(campaigns, insights) {
      const insightsMap = new Map();
      insights.forEach((insight) => {
        if (insight.campaign_id) insightsMap.set(insight.campaign_id, insight);
      });

      return campaigns.map((camp) => ({
        ...camp,
        insights: insightsMap.get(camp.id) || null,
      }));
    }

    const merged3dias = mergeCampaignsAndInsights(allCampaigns, insights3dias);
    const merged7dias = mergeCampaignsAndInsights(allCampaigns, insights7dias);

    console.log(`Combinación completada: ${merged3dias.length} (3d) / ${merged7dias.length} (7d)`);

    // ============================================================
    // 🔹 RESPUESTA FINAL
    // ============================================================

    res.json({
      total_campaigns: allCampaigns.length,
      insights_summary: {
        "3_dias": insights3dias.length,
        "7_dias": insights7dias.length,
      },
      merged: {
        "3_dias": merged3dias,
        "7_dias": merged7dias,
      },
    });

  } catch (err) {
    console.error("Error general:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
