import express from "express";
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hola mundo");
});

app.post("/saludo", express.json(), (req, res) => {
  console.log("Body completo recibido:", req.body);
  console.log("Tipo de body:", typeof req.body);
  console.log("Tiene ad_accounts?:", req.body.hasOwnProperty("ad_accounts"));

  const ad_accounts = req.body?.ad_accounts ?? [];
  console.log("Valor de ad_accounts:", ad_accounts);

  res.json({ count: ad_accounts.length });
});



const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
