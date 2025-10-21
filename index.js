import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/saludo", async (req, res) => {
  try {
    if (req.body.tipo_solicitud !== "smoked") {
      return res.status(400).json({ error: "tipo_solicitud no reconocido" });
    }

    // ===========  Fechas ==========
    const formatDate = (date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

    const today = new Date();
    const sinceDate3 = new Date(today);
    sinceDate3.setDate(today.getDate() - 3);

    const fecha3dias = {
      since: formatDate(sinceDate3),
      until: formatDate(today),
    };

    console.log("🗓 Rango de fechas (3 días):", fecha3dias);

    // ===========  Validación ==========
    const ad_accounts = req.body?.ad_accounts ?? [];
    if (!ad_accounts.length) {
      return res.status(400).json({ error: "No se enviaron ad_accounts" });
    }

    const token = "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD";
    const url_base = "https://graph.facebook.com/v23.0/";

    // ============================================================
    // 🔹 PRIMERA LLAMADA: obtener CAMPAÑAS ACTIVAS
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

    console.log(`Se generaron ${batches.length} lotes de batch requests de campañas`);

    const responsesCampaigns = await Promise.all(
      batches.map(async (batch, i) => {
        const response = await fetch(url_base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: token,
            batch: batch,
          }),
        });

        const data = await response.json();
        console.log(`Batch de campañas ${i + 1} procesado`);
        return data;
      })
    );

    // Combinar todas las campañas en un solo array plano
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
    // 🔹 SEGUNDA LLAMADA: obtener INSIGHTS
    // ============================================================

    index = 0;
    batches = [];

    const timeRangeEncoded = encodeURIComponent(
      JSON.stringify({ since: fecha3dias.since, until: fecha3dias.until })
    );

    while (index < ad_accounts.length) {
      const group = ad_accounts.slice(index, index + 50);
      const templateBatch = group.map((ad_account) => ({
        method: "GET",
        relative_url: `${ad_account}/insights?fields=campaign_id,adset_id,date_start,date_stop,actions,spend,impressions,clicks&time_range=${timeRangeEncoded}&level=campaign&limit=500`,
      }));
      batches.push(templateBatch);
      index += 50;
    }

    console.log(`Se generaron ${batches.length} lotes de batch requests de insights`);

    const responsesInsights = await Promise.all(
      batches.map(async (batch, i) => {
        const response = await fetch(url_base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: token,
            batch: batch,
          }),
        });

        const data = await response.json();
        console.log(`Batch de insights ${i + 1} procesado`);
        return data;
      })
    );

    // Combinar todos los insights en un solo array plano
    const allInsights = responsesInsights.flatMap((batch) =>
      batch.flatMap((item) => {
        try {
          const parsed = JSON.parse(item.body);
          return parsed.data || [];
        } catch (err) {
          console.error("Error parseando insights:", err);
          return [];
        }
      })
    );

    console.log(`Total insights obtenidos: ${allInsights.length}`);

    // ============================================================
    // 🔹 UNIR CAMPAÑAS + INSIGHTS POR campaign_id
    // ============================================================

    const insightsMap = new Map();
    allInsights.forEach((insight) => {
      if (insight.campaign_id) {
        insightsMap.set(insight.campaign_id, insight);
      }
    });

    const merged = allCampaigns.map((camp) => {
      const insight = insightsMap.get(camp.id);
      return {
        ...camp,
        insights: insight || null,
      };
    });

    console.log(`Total de campañas combinadas con insights: ${merged.length}`);

    // ============================================================
    // 🔹 RESPUESTA FINAL
    // ============================================================

    res.json({
      total_campaigns: allCampaigns.length,
      total_insights: allInsights.length,
      merged_count: merged.length,
      data: merged,
    });

  } catch (err) {
    console.error("Error general:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
