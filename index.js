import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/saludo", async (req, res) => {
  if (req.body.tipo_solicitud !== "smoked") {
    return res.status(400).json({ error: "tipo_solicitud no reconocido" });
  }

  // ===========  Fechas  ==========
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

  try {
    console.log("🗓️ Fechas:", fecha3dias);
    console.log("📩 Body recibido:", req.body);

    const token =
      "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD";
    const ad_accounts = req.body?.ad_accounts ?? [];

    if (!ad_accounts.length) {
      return res.status(400).json({ error: "No se enviaron ad_accounts" });
    }

    const url_base = "https://graph.facebook.com/v23.0/";
    let index = 0;

    // ======== Llamada: Campañas ========
    const campaignBatches = [];

    while (index < ad_accounts.length) {
      const group = ad_accounts.slice(index, index + 50);
      const batch = group.map((ad_account) => ({
        method: "GET",
        relative_url: `${ad_account}/campaigns?fields=id,name,effective_status,daily_budget,created_time&filtering=[{'field':'effective_status','operator':'IN','value':['ACTIVE']}]&limit=1000`,
      }));
      campaignBatches.push(batch);
      index += 50;
    }

    console.log(`🚀 Se generaron ${campaignBatches.length} lotes de campañas`);

    const campaignResponses = await Promise.all(
      campaignBatches.map(async (batch, i) => {
        const response = await fetch(url_base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: token,
            batch: batch,
          }),
        });

        const data = await response.json();
        console.log(`✅ Batch de campañas ${i + 1} procesado`);
        return data;
      })
    );

    const allCampaigns = campaignResponses.flatMap((r) =>
      r
        .map((item) => {
          try {
            return JSON.parse(item.body).data;
          } catch {
            return [];
          }
        })
        .flat()
    );

    console.log(`📊 Total campañas obtenidas: ${allCampaigns.length}`);

    // ======== Llamada: Insights ========
    index = 0;
    const insightBatches = [];
    const timeRangeEncoded = encodeURIComponent(
      JSON.stringify({ since: fecha3dias.since, until: fecha3dias.until })
    );

    while (index < ad_accounts.length) {
      const group = ad_accounts.slice(index, index + 50);
      const batch = group.map((ad_account) => ({
        method: "GET",
        relative_url: `${ad_account}/insights?fields=campaign_id,adset_id,date_start,date_stop,actions,spend,impressions,clicks,reach&time_range=${timeRangeEncoded}&level=campaign&limit=500`,
      }));
      insightBatches.push(batch);
      index += 50;
    }

    console.log(`🚀 Se generaron ${insightBatches.length} lotes de insights`);

    const insightResponses = await Promise.all(
      insightBatches.map(async (batch, i) => {
        const response = await fetch(url_base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: token,
            batch: batch,
          }),
        });

        const data = await response.json();
        console.log(`✅ Batch de insights ${i + 1} procesado`);
        return data;
      })
    );

    const allInsights = insightResponses.flatMap((r) =>
      r
        .map((item) => {
          try {
            return JSON.parse(item.body).data;
          } catch {
            return [];
          }
        })
        .flat()
    );

    console.log(`📈 Total insights obtenidos: ${allInsights.length}`);

    // ======== Unir campañas + insights ========
    const insightsMap = new Map(
      allInsights.map((ins) => [ins.campaign_id, ins])
    );

    const mergedData = allCampaigns.map((camp) => {
      const match = insightsMap.get(camp.id);
      return match ? { ...camp, ...match } : camp;
    });

    console.log(`🔗 Total combinados: ${mergedData.length}`);

    // ======== Responder ========
    res.json({
      total_campaigns: allCampaigns.length,
      total_insights: allInsights.length,
      merged: mergedData,
    });
  } catch (err) {
    console.error("❌ Error general:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
