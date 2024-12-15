process.stdin.setEncoding("utf8");
"use strict";
const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const bodyParser = require("body-parser");
require("dotenv").config({ path: path.resolve(__dirname, '.env') });
const portNumber = process.argv[2];


const {
    MongoClient,
    ServerApiVersion
} = require('mongodb');

const uri = `mongodb+srv://${process.env.MONGO_DB_USERNAME}:${process.env.MONGO_DB_PASSWORD}@cluster0.devc9.mongodb.net/${process.env.MONGO_DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");
app.use(express.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(express.urlencoded({
    extended: true
}));
app.use(express.json());


console.log(`Web server started and running at http://localhost:${portNumber}`);
console.log('Stop to shut down the server: ');

process.stdin.on("data", (input) => {
    const command = input.trim();

    if (command === "stop") {
        console.log("Shutting down the server");
        process.exit(0);
    }
});

// login page using login.ejs
app.get("/", (request, response) => {
    response.render("login");
});

// Add new purchase





app.post("/createAccount", async (req, res) => {
    const { username, password } = req.body;

    try {
        await client.connect();
        const db = client.db(process.env.MONGO_DB_NAME);
        const usersCollection = db.collection("users");

        // Check if the username already exists
        const existingUser = await usersCollection.findOne({ username });
        if (existingUser) {
            res.status(400).send("Username already exists. Please choose another one.");
            return;
        }

        // Insert new user
        await usersCollection.insertOne({ username, password });
        res.status(201).send("Account created successfully.");
    } catch (error) {
        console.error(error);
        res.status(500).send("An error occurred while creating the account.");
    } finally {
        await client.close();
    }
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        await client.connect();
        const db = client.db(process.env.MONGO_DB_NAME);
        const usersCollection = db.collection("users");

        const user = await usersCollection.findOne({ username });
        if (!user) {
            return res.status(400).send(`
                <h1>Error</h1>
                <p>User not found. Please create a new account.</p>
                <a href="/createAccount">Create Account</a>
            `);
        }
        if (user.password !== password) {
            return res.status(401).send("Incorrect password. Please try again.");
        }

        res.redirect(`/dashboard?username=${encodeURIComponent(username)}`);
    } catch (e) {
        console.error(e);
        res.status(500).send("Error logging in.");
    } finally {
        await client.close();
    }
});



app.get("/dashboard", async (req, res) => {
    const { username, month } = req.query;

    try {
        await client.connect();
        const db = client.db(process.env.MONGO_DB_NAME);
        const purchasesCollection = db.collection("purchases");

        let query = { user: username };
        if (month && month !== "") {
            const year = new Date().getFullYear(); // Current year
            const startDate = new Date(year, parseInt(month) - 1, 1);
            const endDate = new Date(year, parseInt(month), 0); // Last day of the month
            query.date = { $gte: startDate, $lte: endDate };
        }

        const purchases = await purchasesCollection.find(query).sort({ date: 1 }).toArray(); // Sorting by date in ascending order

        console.log("Fetched purchases:", purchases);
        res.render("dashboard", { user: { username }, purchases, month });
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).send("Error fetching dashboard data.");
    } finally {
        await client.close();
    }
});








app.post('/add-expense', async (req, res) => {
    const { user, name, category, currency, amount, date } = req.body;

    // Log all incoming values for debugging
    console.log("Received data:", { user, name, category, currency, amount, date });
    if (!date) {
    console.error("Date is undefined.");
    return;
    }
    // Validate all required fields are present
    if (!user || !name || !amount || !category || !currency || !date    ) {
        console.log("Error: Missing required fields");
        return res.status(400).send("Missing required fields.");
    }

    try {
        const baseCurrency = 'USD'; // Default base currency
        let exchangeRate = 1; // Default to 1 if no conversion is needed

        // Fetch exchange rate if different from base currency
        if (currency !== baseCurrency) {
            console.log("Date sent to API:", date);
            exchangeRate = await fetchExchangeRate(currency, date);
            
            if (!exchangeRate) {
                console.log("Failed to fetch exchange rate for currency:", currency);
                return res.status(500).send("Failed to fetch exchange rate.");
            }
        }

        const usdAmount = amount * exchangeRate; // Convert amount to USD
        console.log("Exchange Rate:", exchangeRate, "USD Amount:", usdAmount);

        // Connect to MongoDB and insert the purchase
        await client.connect();
        const db = client.db(process.env.MONGO_DB_NAME);
        const purchasesCollection = db.collection("purchases");

        const purchase = {
            user,
            name,
            category,
            originalAmount: amount,
            originalCurrency: currency,
            amount: usdAmount,
            date
        };

        const result = await purchasesCollection.insertOne(purchase);
        console.log("Purchase added successfully:", result);

        res.redirect(`/dashboard?username=${encodeURIComponent(user)}`);
    } catch (error) {
        console.error("Error adding expense:", error);
        res.status(500).send("An error occurred while adding the expense.");
    } finally {
        await client.close();
    }
});



async function fetchExchangeRate(currency, date) {
    const appId = '78c170d013da4111e6103852ebe405cd';
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    let month = dateObj.getMonth() + 1; // JavaScript months are 0-indexed
    let day = dateObj.getDate();
    if(month<10){
        month = '0'+month;
    }
    if(day<10){
        day = '0'+day;
    }
    let url = `https://api.exchangeratesapi.io/v1/${year}-${month}-${day}?access_key=78c170d013da4111e6103852ebe405cd&symbols=${currency}`;
    console.log("URL used for API Call:", url);

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!data.success) {
            console.error('API error:', data.error);
            return null;
        }
        return data.rates[currency];
    } catch (error) {
        console.error('Failed to fetch exchange rates:', error);
        return null;
    }
}


app.get('/test-fetch', async (req, res) => {
    const rate = await fetchExchangeRate('PLN', "2024-10-14");  // Use a hardcoded date for testing
    res.send({ rate });
});





app.get('/createAccount', (req, res) => {
    res.render('createAccount'); // Assumes createAccount.ejs is in the templates folder
});

app.listen(portNumber, () => {});
