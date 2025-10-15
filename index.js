import express from "express";
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hola mundo");
});

app.post("/saludo", (req, res) => {
  const ad_accounts = req.body.ad_accounts;

  res.send(ad_accounts.length);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
