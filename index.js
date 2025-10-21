import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/saludo", async (req, res) => {
  if(req.body.tipo_solicitud == "smoked"){
    const SINCE = new Date()
    const formatoFecha = Intl.DateTimeFormat(en-EN, {year: "numeric", month: "2-digit", day: "2-digit"}).format(SINCE);
    console.log(formatoFecha)
    try {
      console.log("Body recibido:", req.body);
  
      const token = "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD"; // ⚠️ Usa variables de entorno para el token
      const ad_accounts = req.body?.ad_accounts ?? [];
      const url_base = "https://graph.facebook.com/v23.0/";
  
      let index = 0;
      const batches = [];
  
      // Dividimos las cuentas en grupos de hasta 50
      while (index < ad_accounts.length) {
        const group = ad_accounts.slice(index, index + 50);
        const templateBatch = group.map(ad_account => ({
          method: "GET",
          relative_url: `${ad_account}/campaigns?fields=id,name,effective_status,daily_budget,created_time&filtering=[{'field':'effective_status','operator':'IN','value':['ACTIVE']}]&limit=1000`,
        }));
        batches.push(templateBatch);
        index += 50;
      }
  
      console.log(`Se generaron ${batches.length} lotes de batch requests`);
  
      // === AQUÍ entra Promise.all() ===
      const responses = await Promise.all(
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
          console.log(`Batch ${i + 1} procesado`);
          return data;
        })
      );
  
      // Combinar todos los resultados en un solo array
      const combined = responses.flatMap(r => r);
      res.json(combined);
  
    } catch (err) {
      console.error("Error general:", err);
      res.status(500).json({ error: err.message });
    }

  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
