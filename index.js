const express = require("express");
const cors = require("cors");
const { MongoClient, MongoRuntimeError } = require("mongodb");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();

// midleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.grcofim.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const categories = client.db("BikeGhor").collection("Categories");
    const usersCollection = client.db("BikeGhor").collection("Users");
    const productsCollection = client.db("BikeGhor").collection("Products");

    const verifySeller = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Seller") {
        return res.status(403).send({ message: "forebidden access" });
      }
      next();
    };

    // create data
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const getUser = await usersCollection.findOne(query);
      if (!getUser) {
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } else {
        res.send(getUser);
      }
    });

    app.post("/products", verifyJWT, verifySeller, async (req, res) => {
      const product = req.body;
      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    // read data;
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "1d",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

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

    app.get("/users/seller", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.get("/categories", async (req, res) => {
      const query = {};
      const cursor = categories.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/products", verifyJWT, verifySeller, async (req, res) => {
      const email = req.query.email;
      const query = { sellerEmail: email };
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/products/category/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { category: id };
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    });
  } catch (error) {
    console.log(error);
  }
}

run().catch((e) => console.log(e));

app.listen(port, () => console.log(`BikeGhor server running is on ${port}`));
