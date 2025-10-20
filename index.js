import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hola mundo desde Cloud Run 🌤️");
});

// =============================================================

app.post("/saludo", async (req, res) => {
  try {
    console.log("Body recibido:", req.body);

    const token =
      "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD";

    const ad_accounts = req.body?.ad_accounts ?? [];
    const url_base = "https://graph.facebook.com/v23.0/";

    // Creamos el batch de solicitudes
    const batch = ad_accounts.map(ad_account => ({
      method: "GET",
      relative_url: `${ad_account}/campaigns?fields=id,name,status&filtering=[{'field':'effective_status','operator':'IN','value':['ACTIVE']}]&limit=1000`,
    }));

    // Llamada al endpoint de batch
    const response = await fetch(url_base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        batch: batch,
      }),
    });

    //console.log("Response sin pasar a JSON: " + response)

    const data = await response.json();

    console.log("Respuesta de Facebook:", data.body);
    res.json(data); // enviamos la respuesta al cliente
  } catch (err) {
    console.error("Error general:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
