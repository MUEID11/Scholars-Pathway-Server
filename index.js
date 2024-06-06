require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.i7qzqrj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const database = client.db("scholar");
    const reviewsCollection = database.collection("reviews");
    const usersCollection = database.collection("allusers");
    const scholarshipCollection = database.collection("scholarship");
    //jwt token
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });
    //middleware
    const verifyToken = (req, res, next) => {
      console.log("verify token from middleware", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "Forbidden access" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(403).send({ message: "Unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    //verify admin has to be on a same middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "Admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    //verify moderator has to be on a same middleware
    const verifyAdminOrModerator = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);

      if (!user) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const isAdminOrModerator =
        user.role === "Admin" || user.role === "Moderator";

      if (!isAdminOrModerator) {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    //user related apis
    //checking isAdmin or not
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "Admin";
      }
      res.send({ admin });
    });
    //checking is moderator or not
    app.get("/users/moderator/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let moderator = false;
      if (user) {
        moderator = user?.role === "Moderator";
      }
      res.send({ moderator });
    });
    // adding user with registration or google sign in
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already in DB", isertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    //user profile unprotected api
    app.get("/profile/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unautorized access" });
      }
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      console.log(result);
      res.send(result);
    });
    app.get("/users", verifyToken, verifyAdminOrModerator, async (req, res) => {
      const { current, pageSize } = req.query;
      const page = Number(current) - 1;
      const limit = Number(pageSize);
      const skip = page * limit;

      const total = await usersCollection.countDocuments();
      const result = await usersCollection
        .find()
        .skip(skip)
        .limit(limit)
        .toArray();

      res.send({ result, total });
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/users/admin", verifyToken, verifyAdmin, async (req, res) => {
      const { id, role } = req.query;
      console.log(id, role);
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: role,
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    //client side apis
    //adding scholarship
    app.post(
      "/scholarship",
      verifyToken,
      verifyAdminOrModerator,
      async (req, res) => {
        const scholarshipData = req.body;
        console.log(scholarshipData)
        const result = await scholarshipCollection.insertOne(scholarshipData);
        res.send(result);
      }
    );
    //get scholarship data
    app.get('/scholarships', async(req, res) => {
      const result = await scholarshipCollection.find().toArray();
      res.send(result);
    })
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(port, () => {
  console.log(`server is running on ${port}`);
});
