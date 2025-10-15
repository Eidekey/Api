import express from "express";
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hola desde Cloud Run con Express 🚀");
});

app.post("/saludo", (req, res) => {
  const nombre = req.body.nombre || "Desconocido";
  res.json({ mensaje: `Hola ${nombre}, saludos desde Cloud Run! 🌤️` });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
