const express = require("express");
const cors = require("cors");
const { MongoClient, MongoRuntimeError } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();

// midleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.grcofim.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

async function run() {
  try {
    const categories = client.db("BikeGhor").collection("Categories");
    const usersCollection = client.db("BikeGhor").collection("Users");

    // create data
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // read data;
    app.get("/users/buyer/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isBuyer: user?.role === "Buyer" });
    });
    app.get("/users/seller/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isSeller: user?.role === "Seller" });
    });
  } catch (error) {
    console.log(error);
  }
}

run().catch((e) => console.log(e));

app.listen(port, () => console.log(`BikeGhor server running is on ${port}`));
