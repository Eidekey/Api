import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/saludo", async (req, res) => {
  if (req.body.tipo_solicitud == "smoked") {
    // ===========  Fechas  ==========
  const formatDate = (date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);

  const today = new Date();
  const since3 = new Date(today);
  since3.setDate(today.getDate() - 3);

  const since7 = new Date(today);
  since7.setDate(today.getDate() - 7);

  const fechas = {
    tresDias: { since: formatDate(since3), until: formatDate(today) },
    sieteDias: { since: formatDate(since7), until: formatDate(today) },
  };

  try {
    console.log("📅 Fechas:", fechas);
    console.log("📦 Body recibido:", req.body);

    const token = "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD";
    const ad_accounts = req.body?.ad_accounts ?? [];

    if (!ad_accounts.length) {
      return res.status(400).json({ error: "No se enviaron ad_accounts" });
    }

    const url_base = "https://graph.facebook.com/v23.0/";

    // ======== Obtener nombres de las cuentas ========
    console.log("📡 Obteniendo nombres de las ad accounts...");
    const accountNames = {};

    await Promise.all(
      ad_accounts.map(async (account_id) => {
        try {
          const resp = await fetch(`${url_base}${account_id}?fields=name&access_token=${token}`);
          const data = await resp.json();
          accountNames[account_id] = data.name || "Sin nombre";
        } catch {
          accountNames[account_id] = "Desconocido";
        }
      })
    );

    console.log("✅ Nombres de ad accounts obtenidos.");

    // ======== Llamada: Campañas ========
    const campaignBatches = [];
    let index = 0;

    while (index < ad_accounts.length) {
      const group = ad_accounts.slice(index, index + 50);
      const batch = group.map((ad_account) => ({
        method: "GET",
        relative_url: `${ad_account}/campaigns?fields=id,name,effective_status,daily_budget,created_time&filtering=[{'field':'effective_status','operator':'IN','value':['ACTIVE']}]&limit=1000`,
      }));
      campaignBatches.push(batch);
      index += 50;
    }

    console.log(`📊 Se generaron ${campaignBatches.length} lotes de campañas`);

    const campaignResponses = await Promise.all(
      campaignBatches.map(async (batch, i) => {
        const response = await fetch(url_base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: token, batch }),
        });

        const data = await response.json();
        console.log(`✅ Batch de campañas ${i + 1} procesado`);
        return data;
      })
    );

    // Extraer todas las campañas y agregar account_name
    const allCampaigns = campaignResponses
      .flatMap((r) =>
        r
          .map((item, idx) => {
            try {
              const body = JSON.parse(item.body);
              // Determinar qué ad account corresponde
              const adAccount = ad_accounts[Math.floor(idx / 50)] || "unknown";
              return (body.data ?? []).map((camp) => ({
                ...camp,
                ad_account_id: adAccount,
                account_name: accountNames[adAccount] || "Sin nombre",
              }));
            } catch {
              return [];
            }
          })
          .flat()
      )
      .flat();

    console.log(`📈 Total campañas obtenidas: ${allCampaigns.length}`);

    // ======== Llamada: Insights (para 3 y 7 días) ========
    async function getInsights(timeRange, label) {
      let index = 0;
      const insightBatches = [];
      const timeRangeEncoded = encodeURIComponent(JSON.stringify(timeRange));

      while (index < ad_accounts.length) {
        const group = ad_accounts.slice(index, index + 50);
        const batch = group.map((ad_account) => ({
          method: "GET",
          relative_url: `${ad_account}/insights?fields=campaign_id,adset_id,date_start,date_stop,actions,spend,impressions,clicks,reach,cpm&time_range=${timeRangeEncoded}&level=campaign&limit=500`,
        }));
        insightBatches.push(batch);
        index += 50;
      }

      console.log(`📦 ${label}: ${insightBatches.length} lotes de insights`);

      const insightResponses = await Promise.all(
        insightBatches.map(async (batch, i) => {
          const response = await fetch(url_base, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: token, batch }),
          });

          const data = await response.json();
          console.log(`✅ Batch de insights ${label} ${i + 1} procesado`);
          return data;
        })
      );

      const allInsights = insightResponses
        .flatMap((r, batchIdx) =>
          r
            .map((item, idx) => {
              try {
                const body = JSON.parse(item.body);
                const adAccount = ad_accounts[batchIdx * 50 + idx] || "unknown";
                return (body.data ?? []).map((ins) => ({
                  ...ins,
                  ad_account_id: adAccount,
                  account_name: accountNames[adAccount] || "Sin nombre",
                }));
              } catch {
                return [];
              }
            })
            .flat()
        )
        .flat();

      console.log(`📊 Total insights ${label}: ${allInsights.length}`);
      return allInsights;
    }

    const [insights3, insights7] = await Promise.all([
      getInsights(fechas.tresDias, "3_dias"),
      getInsights(fechas.sieteDias, "7_dias"),
    ]);

    // ======== Unir campañas + insights ========
    const mergeData = (insights) => {
      const map = new Map(insights.map((ins) => [ins.campaign_id, ins]));
      return allCampaigns.map((camp) => {
        const match = map.get(camp.id);
        return match ? { ...camp, ...match } : camp;
      });
    };

    const merged3 = mergeData(insights3);
    const merged7 = mergeData(insights7);

    console.log(`✅ Combinados 3 días: ${merged3.length}`);
    console.log(`✅ Combinados 7 días: ${merged7.length}`);

    res.json({
      "3_dias": merged3,
      "7_dias": merged7,
    });
  } catch (err) {
    console.error("❌ Error general:", err);
    res.status(500).json({ error: err.message });
  }

  }else{
    return res.status(400).json({ error: "tipo_solicitud no reconocido" });
  }

})

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
