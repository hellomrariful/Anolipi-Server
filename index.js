const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express()
const port = process.env.PORT || 5000

// middleware
app.use(cors())
app.use(express.json())


// mongoDB

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.c6bvskv.mongodb.net/?retryWrites=true&w=majority`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const userCollection = client.db('anolipiDB').collection("users")
        const publisherCollection = client.db('anolipiDB').collection("publishers")
        const newsCollection = client.db('anolipiDB').collection("newses")


        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        // middlewares
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // user related api
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        //admin
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        // admin api
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        // publishers API
        app.post('/publishers', async (req, res) => {
            const publishers = req.body;
            const result = await publisherCollection.insertOne(publishers)
            res.send(result)
        })

        app.get('/publishers', async (req, res) => {
            const result = await publisherCollection.find().toArray()
            res.send(result)
        })

        // news API
        app.post('/newses', async(req, res) =>{
            const newses = req.body;
            const result = await newsCollection.insertOne(newses)
            res.send(result)
        })

        app.get('/newses', async(req, res) => {
            const result = await newsCollection.find().toArray()
            res.send(result)
        })

        app.delete("/newses/:id", async(req, res) =>{
            const id = req.params.id
            const query = {_id: new ObjectId(id)}
            const result = await newsCollection.deleteOne(query)
            res.send(result)
        })




        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



// testing
app.get('/', (req, res) => {
    res.send('Server is running')
})

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
})