const express = require('express')
const app = express()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
        const paymentCollection = client.db('anolipiDB').collection("payments")

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
        app.get('/users', verifyToken, async (req, res) => {
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

        app.get('/publishers', verifyToken, async (req, res) => {
            const result = await publisherCollection.find().toArray()
            res.send(result)
        })

        // news API
        app.post('/newses', async (req, res) => {
            const newses = req.body;
            const result = await newsCollection.insertOne(newses)
            res.send(result)
        })

        app.get('/newses', async (req, res) => {
            const result = await newsCollection.find().toArray()
            res.send(result)
        })


        app.get("/articles", async (req, res) => {
            try {
                const filter = req.query;
                console.log(filter);
                const query = {
                    title: { $regex: filter.search, $options: 'i' }
                };
                let imgLimit = parseInt(req.query.limit);
                let imgOffset = parseInt(req.query.offset) || 0;

                const total = (await newsCollection.find(query).toArray()).length;

                if (imgOffset >= total) {
                    return res.send({ result: [], total: 0 });
                }

                const result = await newsCollection.find(query).skip(imgOffset).limit(imgLimit).toArray();
                res.send({
                    result,
                    total: total,
                });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        app.get('/newses/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await newsCollection.findOne(query)
            res.send(result)
        })

        app.delete("/newses/:id", async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await newsCollection.deleteOne(query)
            res.send(result)
        })

        app.patch('/newses/approve/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: 'Approve',
                }
            };
            const result = await newsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.patch('/newses/decline/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: 'Decline',
                    isPremium: 'No',
                }
            };
            const result = await newsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.patch('/newses/premium/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    isPremium: 'Yes',
                }
            };
            const result = await newsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });


        // decline api
        app.patch('/newses/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const update = { $set: { declineText: req.body.textareaValue } };
            try {
                const result = await newsCollection.updateOne(filter, update);
                res.send(result);
            } catch (error) {
                console.error('Error updating news item:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        app.patch('/newses/viewCount/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const update = { $inc: { viewCount: 1 } };
            try {
                const result = await newsCollection.updateOne(filter, update);
                console.log("line number", result);
                res.send(result);
            } catch (error) {
                console.error('Error updating news item:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });





        app.put('/newses/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true };
            const updatedNews = req.body;
            const news = {
                $set: {
                    title: updatedNews.title,
                    description: updatedNews.description,
                    tags: updatedNews.tags,
                    newsImage: updatedNews.newsImage,
                    date: updatedNews.date,
                    publisherName: updatedNews.publisherName,
                    publisherPhoto: updatedNews.publisherPhoto,
                    authorName: updatedNews.authorName,
                    authorEmail: updatedNews.authorEmail,
                    authorPhoto: updatedNews.authorPhoto
                }
            }
            const result = await newsCollection.updateOne(filter, news, options);
            res.send(result);
        });



        app.patch('/users/subscribe/:email', async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const { price, subscribeTime } = req.body;
            const updatedDoc = {
                $set: {
                    email: email,
                    price: price,
                    subscribeTime: subscribeTime
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        app.patch('/users/:email', async (req, res) => {
            const email = req.params.email

            const filter = { email: email }
            const updatedDoc = {
                $set: {
                    premiumTaken: "Yes"
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        app.patch('/users/null/:email', async (req, res) => {
            const email = req.params.email;
            console.log(email);
            const filter = { email: email };
            const updatedDoc = {
                $set: {
                    premiumTaken: null
                }
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        // payment API
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent')

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });


        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/users/premium/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let premium = false;
            if (user) {
                premium = user?.premiumTaken === 'Yes';
            }
            res.send({ premium });
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
            res.send(result)
        })


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