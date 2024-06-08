require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.SECRET_TEST_KEY);
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
    const appliedCollection = database.collection('appliedCollection')
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
      // console.log("verify token from middleware", req.headers.authorization);
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
    app.get("/users/admin", verifyToken, async (req, res) => {
      const query = { email: req.decoded.email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "Admin";
      }
      res.send({ admin });
    });
    //checking is moderator or not
    app.get("/users/moderator", verifyToken, async (req, res) => {
      const query = { email: req.decoded.email };
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

        const result = await scholarshipCollection.insertOne(scholarshipData);
        res.send(result);
      }
    );
    //get scholarship data
    app.get("/scholarships", async (req, res) => {
      try {
        // Extract the current page and page size from the query parameters
        const { current, pageSize } = req.query;

        // Calculate the pagination variables
        const page = Number(current) - 1; // Zero-based index for MongoDB
        const limit = Number(pageSize);
        const skip = page * limit;

        // Get the total number of documents
        const total = await scholarshipCollection.countDocuments();

        // Fetch the paginated results
        const result = await scholarshipCollection
          .find()
          .skip(skip)
          .limit(limit)
          .toArray();

        // Send the results and total count to the client
        res.send({ result, total });
      } catch (error) {
        // Handle any errors that occur
        res
          .status(500)
          .send({ error: "An error occurred while fetching scholarships." });
      }
    });
    app.get("/scholarship/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await scholarshipCollection.findOne(query);
      res.send(result);
    });
    //delete scholarship
    app.delete(
      "/deletescholarship/:id",
      verifyToken,
      verifyAdminOrModerator,
      async (req, res) => {
        const id = req.params.id;
        console.log(id);
        const query = { _id: new ObjectId(id) };
        const result = await scholarshipCollection.deleteOne(query);
        res.send(result);
      }
    );
    //update scholarship
    app.patch(
      "/updatescholarship/:id",
      verifyToken,
      verifyAdminOrModerator,
      async (req, res) => {
        const id = req.params.id;
        const formData = req.body;

        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updatedDoc = {
          $set: {
            ...formData,
          },
        };
        const result = await scholarshipCollection.updateOne(
          filter,
          updatedDoc,
          options
        );
        console.log(result);
        res.send(result);
      }
    );
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });
    //payment intent
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;
        if (!price || isNaN(price)) {
          return res.status(400).send({ error: "Invalid price" });
        }

        const amount = parseInt(price * 100);
        console.log(`Creating payment intent for amount: ${amount}`);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ error: "Failed to create payment intent" });
      }
    });
    //applied collection
    app.post('/applied', verifyToken, async (req, res) => {
      const appliedScholarship = req.body;
      try {
          const result = await appliedCollection.insertOne(appliedScholarship);
  
          const id = appliedScholarship?.scholarshipId;
          const query = { _id: new ObjectId(id) }; 
          const updateDoc = {
              $inc: { appliedCount: 1 } // Increment appliedCount by 1
          };
          // Update the appliedCount in the scholarshipCollection
          const updateCount = await scholarshipCollection.updateOne(query, updateDoc);
          // Send the result back to the client
          res.send({result, updateCount});
      } catch (error) {
          console.error('Error applying for scholarship:', error);
          res.status(500).send({ message: 'Failed to apply for scholarship' });
      }
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
