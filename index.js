import express from "express";
import fetch from "node-fetch";
import { load } from "cheerio";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  since3.setDate(today.getDate() - 2 );

  const since7 = new Date(today);
  since7.setDate(today.getDate() - 6);


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

    // ======== Obtener nombres de las cuentas (optimizado en batch) ========
console.log("📡 Obteniendo nombres de las ad accounts (batch)...");

const accountNames = {};
let index2 = 0;
const nameBatches = [];

// Dividir en bloques de hasta 50 cuentas
while (index2 < ad_accounts.length) {
  const group = ad_accounts.slice(index2, index2 + 50);
  const batch = group.map((account_id) => ({
    method: "GET",
    relative_url: `${account_id}?fields=name`,
  }));
  nameBatches.push(batch);
  index2 += 50;
}

// Ejecutar los lotes en paralelo con promesas
const nameResponses = await Promise.all(
  nameBatches.map(async (batch, i) => {
    const response = await fetch(url_base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token, batch }),
    });

    const data = await response.json();
    console.log(`✅ Lote de nombres ${i + 1} procesado (${batch.length} cuentas)`);

    data.forEach((item, idx) => {
      try {
        const body = JSON.parse(item.body);
        const accId = nameBatches[i][idx].relative_url.replace("?fields=name", "");
        accountNames[accId] = body.name || "Sin nombre";
      } catch {
        const accId = nameBatches[i][idx].relative_url.replace("?fields=name", "");
        accountNames[accId] = "Desconocido";
      }
    });
  })
);

console.log("✅ Nombres de ad accounts obtenidos (batch).");


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

  } else if (req.body.tipo_solicitud === "Ad_accounts") {

    const token = "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD";

    try {
      // =========================
      // 1️⃣ Obtener todas las Ad Accounts
      // =========================
      let allAccounts = [];
      let nextUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name&limit=5000&access_token=${token}`;

      while (nextUrl) {
        const resp = await fetch(nextUrl);
        const data = await resp.json();
        if (data.data) allAccounts = allAccounts.concat(data.data);
        nextUrl = data.paging?.next || null;
      }

      console.log(`✅ Total de cuentas encontradas: ${allAccounts.length}`);

      // =========================
      // 2️⃣ Dividir en bloques de 50
      // =========================
      const chunkSize = 50;
      const chunks = [];
      for (let i = 0; i < allAccounts.length; i += chunkSize) {
        chunks.push(allAccounts.slice(i, i + chunkSize));
      }

      // =========================
      // 3️⃣ Fechas últimos 15 días
      // =========================
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 15);
      const since = start.toISOString().split("T")[0];
      const until = end.toISOString().split("T")[0];

      console.log(`📆 Rango: ${since} → ${until}`);

      // =========================
      // 4️⃣ Ejecutar batch requests
      // =========================
      const results = [];

      for (const chunk of chunks) {
        const batch = chunk.map(acc => ({
          method: "GET",
          relative_url: `${acc.id}/insights?fields=account_id,account_name,impressions,reach,spend,date_start,date_stop&time_range[since]=${since}&time_range[until]=${until}&level=account`
        }));

        const batchUrl = `https://graph.facebook.com/v21.0/?access_token=${token}`;
        const resp = await fetch(batchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch })
        });

        const batchData = await resp.json();

        // Test de una cuenta específica
        const testAccount = allAccounts[0]?.id;
        if (testAccount) {
          const testUrl = `https://graph.facebook.com/v21.0/${testAccount}/insights?fields=account_id,account_name,impressions,reach,spend,date_start,date_stop&time_range[since]=${since}&time_range[until]=${until}&level=account&access_token=${token}`;
          const testResp = await fetch(testUrl);
          const testData = await testResp.json();
          console.log("🔍 Test insights 1 cuenta:", testData);
        }


        batchData.forEach((r) => {
          if (r?.body) {
            const parsed = JSON.parse(r.body);
            if (parsed.data && parsed.data.length > 0) {
              const d = parsed.data[0];
              results.push({
                ad_account_id: d.account_id,
                ad_account_name: d.account_name,
                impressions: d.impressions,
                reach: d.reach,
                amount_spent: d.spend,
                reporting_starts: d.date_start,
                reporting_ends: d.date_stop,
              });
            }
          }
        });
      }

      // =========================
      // 5️⃣ Filtrar solo con datos
      // =========================
      const validResults = results.filter(r => r.impressions && Number(r.impressions) > 0);

      console.log(`📊 Cuentas con insights: ${validResults.length}`);

      // =========================
      // 6️⃣ Enviar respuesta final
      // =========================
      res.json({
        total_con_insights: validResults.length,
        resultados: validResults
      });

    } catch (error) {
      console.error("❌ Error obteniendo insights de cuentas:", error);
      res.status(500).json({ error: error.message });
    }

  } else if (req.body.tipo_solicitud == "custom_filter") {
  try {
    const token = "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD";
    const ad_accounts = req.body?.ad_accounts ?? [];
    const { since, until } = req.body ?? {};

    if (!ad_accounts.length) {
      return res.status(400).json({ error: "No se enviaron ad_accounts" });
    }
    if (!since || !until) {
      return res.status(400).json({ error: "Debe enviar since y until" });
    }

    console.log("📅 Fechas personalizadas:", { since, until });

    const url_base = "https://graph.facebook.com/v23.0/";

    // ======== Obtener nombres de las cuentas (batch) ========
    console.log("📡 Obteniendo nombres de las ad accounts (batch)...");

    const accountNames = {};
    let index2 = 0;
    const nameBatches = [];

    while (index2 < ad_accounts.length) {
      const group = ad_accounts.slice(index2, index2 + 50);
      const batch = group.map((account_id) => ({
        method: "GET",
        relative_url: `${account_id}?fields=name`,
      }));
      nameBatches.push(batch);
      index2 += 50;
    }

    await Promise.all(
      nameBatches.map(async (batch, i) => {
        const response = await fetch(url_base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: token, batch }),
        });

        const data = await response.json();
        console.log(`✅ Lote de nombres ${i + 1} procesado (${batch.length} cuentas)`);

        data.forEach((item, idx) => {
          try {
            const body = JSON.parse(item.body);
            const accId = nameBatches[i][idx].relative_url.replace("?fields=name", "");
            accountNames[accId] = body.name || "Sin nombre";
          } catch {
            const accId = nameBatches[i][idx].relative_url.replace("?fields=name", "");
            accountNames[accId] = "Desconocido";
          }
        });
      })
    );

    console.log("✅ Nombres de ad accounts obtenidos (batch).");

    // ======== Llamada: Campañas activas ========
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

    // ======== Llamada: Insights (una sola, fechas personalizadas) ========
    const timeRange = { since, until };
    const timeRangeEncoded = encodeURIComponent(JSON.stringify(timeRange));
    const insightBatches = [];
    let index3 = 0;

    while (index3 < ad_accounts.length) {
      const group = ad_accounts.slice(index3, index3 + 50);
      const batch = group.map((ad_account) => ({
        method: "GET",
        relative_url: `${ad_account}/insights?fields=campaign_id,adset_id,date_start,date_stop,spend,impressions,clicks,reach,cpm,actions&time_range=${timeRangeEncoded}&level=campaign&limit=500`,
      }));
      insightBatches.push(batch);
      index3 += 50;
    }

    console.log(`📦 Se generaron ${insightBatches.length} lotes de insights`);

    const insightResponses = await Promise.all(
      insightBatches.map(async (batch, i) => {
        const response = await fetch(url_base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: token, batch }),
        });

        const data = await response.json();
        console.log(`✅ Batch de insights ${i + 1} procesado`);
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

    console.log(`📊 Total insights: ${allInsights.length}`);

    // ======== Unir campañas + insights ========
    const mergeData = (insights) => {
      const map = new Map(insights.map((ins) => [ins.campaign_id, ins]));
      return allCampaigns.map((camp) => {
        const match = map.get(camp.id);
        return match ? { ...camp, ...match } : camp;
      });
    };

    const merged = mergeData(allInsights);
    const filtradas = merged.filter((item) => item.spend && parseFloat(item.spend) > 0);

    console.log(`✅ Total combinadas y filtradas: ${filtradas.length}`);

    res.json({
      rango: { since, until },
      total: filtradas.length,
      resultados: filtradas,
    });
  } catch (err) {
    console.error("❌ Error general:", err);
    res.status(500).json({ error: err.message });
  }
}else if (req.body.tipo_solicitud == "errors_full") {
  try {
    console.log("🚨 Iniciando revisión de errores a nivel de ad account (por ads directos, con batch)...");

    const token = "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD";
    const url_base = "https://graph.facebook.com/v23.0";
    const ad_accounts = req.body?.ad_accounts ?? [];

    if (!ad_accounts.length) {
      return res.status(400).json({ error: "No se enviaron ad_accounts" });
    }

    const resultados = [];

    // === Función para dividir en bloques ===
    function chunkArray(arr, size) {
      const res = [];
      for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
      return res;
    }

    // === 1️⃣ Obtener nombres de ad accounts ===
    console.log("📡 Obteniendo nombres de ad accounts...");
    const accountNames = {};
    const nameBatches = chunkArray(ad_accounts, 50);

    for (let i = 0; i < nameBatches.length; i++) {
      const batch = nameBatches[i].map((id) => ({
        method: "GET",
        relative_url: `${id}?fields=name`,
      }));

      const resBatch = await fetch(url_base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, batch }),
      });

      const data = await resBatch.json();
      data.forEach((item, idx) => {
        const accId = nameBatches[i][idx];
        try {
          const body = JSON.parse(item.body);
          accountNames[accId] = body.name || "Sin nombre";
        } catch {
          accountNames[accId] = "Desconocido";
        }
      });

      console.log(`✅ Batch ${i + 1}/${nameBatches.length} nombres procesado`);
      await new Promise((r) => setTimeout(r, 400));
    }

    // === 2️⃣ Obtener todos los ads (batch) ===
    console.log("📥 Descargando ads (batch extendido)...");
    const adBatches = chunkArray(ad_accounts, 50);
    const allAdsByAccount = {};

    for (let i = 0; i < adBatches.length; i++) {
      const batch = adBatches[i].map((accountId) => ({
        method: "GET",
        relative_url: `${accountId}/ads?fields=id,name,campaign_id,campaign_name,effective_status,issues_info,ad_review_feedback&limit=500`,
      }));

      const resBatch = await fetch(url_base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, batch }),
      });

      const data = await resBatch.json();
      data.forEach((item, idx) => {
        const accountId = adBatches[i][idx];
        try {
          const body = JSON.parse(item.body);
          allAdsByAccount[accountId] = body.data || [];
        } catch {
          allAdsByAccount[accountId] = [];
        }
      });

      console.log(`✅ Batch ${i + 1}/${adBatches.length} ads procesado`);
      await new Promise((r) => setTimeout(r, 400));
    }

    // === 3️⃣ Detectar campañas sin nombre y obtener su status ===
    console.log("🔍 Verificando campañas sin nombre y status...");
    const missingCampaignIds = new Set();

    for (const ads of Object.values(allAdsByAccount)) {
      for (const ad of ads) {
        if (ad.campaign_id) {
          missingCampaignIds.add(ad.campaign_id);
        }
      }
    }

    const campaignInfo = {};
    const campaignIdList = Array.from(missingCampaignIds);
    const campaignBatches = chunkArray(campaignIdList, 50);

    for (let i = 0; i < campaignBatches.length; i++) {
      const batch = campaignBatches[i].map((id) => ({
        method: "GET",
        relative_url: `${id}?fields=name,effective_status`,
      }));

      const resBatch = await fetch(url_base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, batch }),
      });

      const data = await resBatch.json();
      data.forEach((item, idx) => {
        const campId = campaignBatches[i][idx];
        try {
          const body = JSON.parse(item.body);
          campaignInfo[campId] = {
            name: body.name || "Desconocida",
            status: body.effective_status || "UNKNOWN",
          };
        } catch {
          campaignInfo[campId] = { name: "Desconocida", status: "UNKNOWN" };
        }
      });

      console.log(`✅ Batch ${i + 1}/${campaignBatches.length} campañas procesado`);
      await new Promise((r) => setTimeout(r, 400));
    }

    // === 4️⃣ Filtrar ads con errores y agrupar por campaña ===
    console.log("🧩 Filtrando ads con errores y agrupando por campaña...");
    for (const accountId of Object.keys(allAdsByAccount)) {
      const ads = allAdsByAccount[accountId] || [];

      const adsConErrores = ads.filter(
        (ad) =>
          (ad.issues_info && ad.issues_info.length > 0) ||
          (ad.ad_review_feedback && Object.keys(ad.ad_review_feedback).length > 0) ||
          (ad.effective_status && ad.effective_status.includes("DISAPPROVED"))
      );

      if (!adsConErrores.length) continue;

      const campaignsMap = new Map();

      for (const ad of adsConErrores) {
        const campId = ad.campaign_id || "unknown";
        const info = campaignInfo[campId] || {};
        const campName = info.name || ad.campaign_name || "Desconocida";
        const campStatus = info.status || "UNKNOWN";

        if (!campaignsMap.has(campId)) {
          campaignsMap.set(campId, {
            ad_account_id: accountId,
            ad_account_name: accountNames[accountId] || "Sin nombre",
            campaign_id: campId,
            campaign_name: campName,
            campaign_status: campStatus, // 👈 aquí se indica si está desactivada
            total_ads_con_errores: 0,
            ads_con_error: [],
          });
        }

        const entry = campaignsMap.get(campId);
        entry.total_ads_con_errores++;
        entry.ads_con_error.push(ad.name || ad.id);
      }

      resultados.push(...campaignsMap.values());
    }

    console.log(`✅ Total de campañas con errores: ${resultados.length}`);
    res.json({ total: resultados.length, resultados });

  } catch (err) {
    console.error("❌ Error general en errors_full:", err);
    res.status(500).json({ error: err.message });
  }
}
else{
    return res.status(400).json({ error: "tipo_solicitud no reconocido" });
  }

})

// =======================================================================================================================

app.post("/slack", async (req, res) => {
  try {
    const payload = req.body.payload ? JSON.parse(req.body.payload) : req.body;
    console.log("📨 Slack event recibido:", payload.type);

    // Slack necesita respuesta inmediata
    res.status(200).send();

    // ===============================================
    // ➤ 1. Abrir modal al hacer clic en "Exclude campaigns"
    // ===============================================
    if (payload.type === "block_actions") {
      console.log("🧩 block_actions recibido");

      const triggerId = payload.trigger_id;
      const action = payload.actions && payload.actions[0];
      let campaignsList = [];

      // Extraer lista de campañas del valor del botón
      if (action?.value) {
        try {
          const val = action.value.trim();
          if (val.startsWith("{") || val.startsWith("[")) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              campaignsList = parsed;
            } else if (typeof parsed === "object") {
              campaignsList = Object.entries(parsed).flatMap(([acc, camps]) =>
                (camps || []).map((c) => `${acc} | ${c}`)
              );
            }
          } else {
            console.warn("⚠️ Valor no JSON recibido:", val);
          }
        } catch (err) {
          console.error("❌ Error al parsear campañas:", err);
        }
      }

      if (!campaignsList.length) {
        console.warn("⚠️ campaignsList vacío, no se abrirá modal.");
        return;
      }

      console.log(`📋 ${campaignsList.length} campañas detectadas`);

      // ➤ Agrupar campañas en bloques de máximo 10
      const chunkSize = 10;
      const blocks = [];

      for (let i = 0; i < campaignsList.length; i += chunkSize) {
        const slice = campaignsList.slice(i, i + chunkSize);
        const options = slice.map((c, idx) => ({
          text: { type: "plain_text", text: c },
          value: `excl_${i + idx}__${c}`.slice(0, 200)
        }));

        blocks.push({
          type: "input",
          optional: true, // ✅ ahora no obliga a seleccionar en cada grupo
          block_id: `block_${i / chunkSize}`,
          label: { type: "plain_text", text: `Campaigns ${i + 1}–${i + slice.length}` },
          element: {
            type: "checkboxes",
            action_id: "selected_campaigns",
            options
          }
        });
      }

      const modal = {
        type: "modal",
        callback_id: "exclude_modal",
        title: { type: "plain_text", text: "Exclude Campaigns" },
        submit: { type: "plain_text", text: "Save" },
        close: { type: "plain_text", text: "Cancel" },
        blocks
      };

      // Abrir modal en Slack
      const resp = await fetch("https://slack.com/api/views.open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`
        },
        body: JSON.stringify({ trigger_id: triggerId, view: modal })
      });

      const json = await resp.json();
      console.log("📬 Slack views.open response:", json);
      return;
    }

    // ===============================================
    // ➤ 2. Procesar el envío del modal
    // ===============================================
    if (payload.type === "view_submission") {
      console.log("📨 view_submission recibido");

      const stateValues = payload.view?.state?.values || {};
      const user =
        payload.user?.username || payload.user?.name || payload.user?.id || "Unknown_User";

      const excludedCampaigns = [];

      for (const blockId in stateValues) {
        const action = Object.values(stateValues[blockId])[0];
        if (!action) continue;
        const selected = action.selected_options || [];
        selected.forEach((opt) => {
          const val = opt.value.split("__").slice(1).join("__");
          excludedCampaigns.push(val);
        });
      }

      console.log("✅ Campañas seleccionadas:", excludedCampaigns);

      if (!excludedCampaigns.length) {
        console.log("⚠️ No se seleccionaron campañas");
        return;
      }

      // Enviar a Google Apps Script
      const gsUrl =
        "https://script.google.com/macros/s/AKfycbwaOGvLnODXIw78KYU9sfbH8BhuapunIZ6IPFKxTLraAVEfiMxzAfQXzr2h1ODw0D4i/exec";

      const resp = await fetch(gsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_solicitud: "slack_exclude",
        user,
        campaigns: excludedCampaigns
      })
    });

    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      console.log("📤 Respuesta de Apps Script:", json);
    } catch {
      console.error("⚠️ Apps Script devolvió una respuesta no JSON:", text.slice(0, 100));
    }

      return;
    }

    console.log("ℹ️ Evento no manejado:", payload.type);
  } catch (err) {
    console.error("❌ Error en /slack:", err);
  }
});



  app.post("/verificarLanding", async (req, res) => {
    const { ad_id } = req.body;

    if (!ad_id) {
      return res.status(400).json({ error: "Falta ad_id en body" });
    }

    try {
      const API_VERSION = "v23.0";
      const META_TOKEN = "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD";

      // 1. Llamar a Meta para obtener la landing page
      const metaUrl = `https://graph.facebook.com/${API_VERSION}/${ad_id}?fields=adcreatives{object_story_spec{link_data{link}}}&access_token=${META_TOKEN}`;

      const raw = await fetch(metaUrl);
      const data = await raw.json();

      const landing =
        data?.adcreatives?.data?.[0]?.object_story_spec?.link_data?.link;

      if (!landing) {
        return res.json({
          ad_id,
          ok: false,
          error: "El anuncio no tiene landing page"
        });
      }

      // 2. Revisar la landing con Cheerio
      const result = await revisarLanding(landing);

      res.json({
        ad_id,
        landing,
        ...result
      });

    } catch (err) {
      res.json({
        ad_id,
        ok: false,
        error: err.toString()
      });
    }
  });



// ----------------------
//   Función auxiliar
// ----------------------
async function revisarLanding(url) {
  try {
    const resp = await fetch(url, { timeout: 8000 });

    if (!resp.ok) {
      return { ok: false, status: resp.status, calendario: false };
    }

    const html = await resp.text();
    const $ = load(html);

    // 1. Script del widget
    const tieneScript =
      html.includes("widgets-date-block") ||
      $("script[src*='widgets.leadconnectorhq.com']").length > 0;

    // 2. Iframe del calendario (SIN importar el ID)
    const tieneIframe =
      $("iframe[src*='/calendar/']").length > 0 ||
      $("iframe[src*='leadconnectorhq.com/calendar']").length > 0;

    return {
      ok: true,
      status: 200,
      calendario: tieneScript || tieneIframe
    };

  } catch (err) {
    return {
      ok: false,
      status: "timeout/error",
      calendario: false
    };
  }
}





// ==================================================
// Endpoint simple para verificar estado
// ==================================================
app.get("/status", (req, res) => {
  res.status(200).send("✅ API funcionando correctamente");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
