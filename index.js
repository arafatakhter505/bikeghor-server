const express = require("express");
const cors = require("cors");
const { MongoClient, MongoRuntimeError, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    const ordersCollection = client.db("BikeGhor").collection("Orders");
    const advertiseCollection = client.db("BikeGhor").collection("Advertise");
    const wishlistCollection = client.db("BikeGhor").collection("WishList");
    const paymentsCollection = client.db("BikeGhor").collection("Payments");

    const verifySeller = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Seller") {
        return res.status(403).send({ message: "forebidden access" });
      }
      next();
    };

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Admin") {
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

    app.post("/orders", verifyJWT, async (req, res) => {
      const order = req.body;
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    app.post("/advertise", verifyJWT, verifySeller, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const advertised = req.body;
      const query = { productId: advertised.productId };
      const findResult = await advertiseCollection.findOne(query);
      if (findResult) {
        return res.send({ message: "Allready advetise have this product" });
      }
      const result = await advertiseCollection.insertOne(advertised);
      res.send(result);
    });

    app.post("/wishlist", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const item = req.body;
      const query = { productId: item.productId };
      const findResult = await wishlistCollection.findOne(query);
      if (findResult) {
        return res.send({ message: "Allready wishlist have this product" });
      }
      const result = await wishlistCollection.insertOne(item);
      res.send(result);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const product = req.body;
      const price = product.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      const id = payment.productId;
      const productFilter = { _id: ObjectId(id) };
      const filter = { productId: id };
      const updateDoc = {
        $set: {
          sold: true,
        },
      };
      const updateOrderDoc = {
        $set: {
          paid: true,
        },
      };
      const options = { upsert: true };
      const updateOrder = await ordersCollection.updateOne(
        filter,
        updateOrderDoc,
        options
      );
      const updateProduct = await productsCollection.updateOne(
        productFilter,
        updateDoc
      );
      const updateAdvertised = await advertiseCollection.updateOne(
        filter,
        updateDoc
      );
      const deleteWishlist = await wishlistCollection.deleteOne(filter);
      res.send({
        result,
        updateProduct,
        updateAdvertised,
        updateOrder,
        deleteWishlist,
      });
    });

    // read data;
    app.get("/", (req, res) => {
      res.send("Bike Server Running");
    });

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

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "Admin" });
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
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { sellerEmail: email };
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/products/category/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { category: id, sold: false };
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/orders", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/advertise", async (req, res) => {
      const query = {};
      const result = await advertiseCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/sellers", verifyJWT, verifyAdmin, async (req, res) => {
      const query = { role: "Seller" };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/buyers", verifyJWT, verifyAdmin, async (req, res) => {
      const query = { role: "Buyer" };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/wishlist", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { email };
      const result = await wishlistCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/products/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    // update data
    app.put("/products/booked/:id", verifyJWT, async (req, res) => {
      const product = req.body;
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateProduct = {
        $set: {
          booked: product.booked,
        },
      };
      const result = await productsCollection.updateOne(
        filter,
        updateProduct,
        options
      );
      res.send(result);
    });

    app.put("/sellers/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const seller = req.body;
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateSeller = {
        $set: {
          varified: seller.varified,
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateSeller,
        options
      );
      res.send(result);
    });

    // delete data
    app.delete("/products/:id", verifyJWT, verifySeller, async (req, res) => {
      const email = req.query.email;
      const id = req.params.id;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const filter = { _id: ObjectId(id) };
      const result = await productsCollection.deleteOne(filter);
      res.send(result);
    });

    app.delete("/advertise/", verifyJWT, verifySeller, async (req, res) => {
      const email = req.query.email;
      const id = req.query.id;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const filter = { productId: id };
      const result = await advertiseCollection.deleteOne(filter);
      res.send(result);
    });

    app.delete("/sellers/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      const id = req.params.id;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const filter = { _id: ObjectId(id) };
      const result = await usersCollection.deleteOne(filter);
      res.send(result);
    });

    app.delete("/buyers/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      const id = req.params.id;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const filter = { _id: ObjectId(id) };
      const result = await usersCollection.deleteOne(filter);
      res.send(result);
    });
  } catch (error) {
    console.log(error);
  }
}

run().catch((e) => console.log(e));

app.listen(port, () => console.log(`BikeGhor server running is on ${port}`));
