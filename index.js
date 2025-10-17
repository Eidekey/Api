import express from "express";
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hola mundo");
});

app.post("/saludo", (req, res) => {
  console.log("Body completo recibido:", req.body);
  console.log("Tipo de body:", typeof req.body);
  console.log("Tiene ad_accounts?:", req.body.hasOwnProperty("ad_accounts"));
  console.log("Valor de ad_accounts:", req.body.ad_accounts);

  const token = "EAAWKn4ZCjg3ABPvM6yNdpT3m0YC4NlOZBqnk6NwP3357JZBlLVtfvSggaJde3bkislJxnIjagEGl5TZCgh2ZB9wFBHtBf7UxkaU90P3g7LMOpkv90ByZC4ODy83ebh4x7egB6vqsHZCecKWGwgAuKLHDOflDLKwlWMNZBv5bQgpCGvv7JlPkUCa4PJlRIRYvfeL5SAZDZD"
  const ad_accounts = req.body?.ad_accounts ?? [];
  const batch = []
  const url_base = "https://graph.facebook.com/v23.0/"
  ad_accounts.forEach((ad_account)=>{
    batch.push({method: "GET", relative_url: `${ad_account}/campaigns?fields=name,status`});
  })

  res = fecth(url_base,{
    method: "POST",
    payload: {
      access_tocken: token,
      batch: JSON.stringify(batch)
  })
  console.log(res)
  //res.json({ count: ad_accounts.length });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
