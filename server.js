// Basically, if we're in dev mode, require dotenv for our .env file
if(process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

const express = require('express')
const app = express()
const mysql = require('mysql')
const bcrypt = require('bcrypt')
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
// This is just for the 'delete' method
const methodOverride = require('method-override')

const db = mysql.createConnection({
    host: process.env.HOST,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE
})
db.connect((err) => {
    if (!err) {
        console.log("Connected to database");
    } else {
        console.log("Conection Failed");
    }
});

// We're going to require our passport-config file so we can
// send passport through that file
const initializePassport = require('./passport-config')
initializePassport(passport, db)

const oneDay = 1000 * 60 * 60 * 24;
var list = {}, gifts = {}

app.set('view-engine', 'ejs')
app.use(express.urlencoded({ extended : false }))
app.use(flash())
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    cookie: { maxAge: oneDay },
    saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))
app.use(express.static("public"))



/*********************************
******      ROUTES          ******
*********************************/

app.get('/', checkNotAuthenticated, (req, res) => {
    res.render('index.ejs')
})

app.get('/login', checkNotAuthenticated, (req, res) => {
    res.render('login.ejs')
})

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: true
}))


app.get('/register', checkNotAuthenticated, (req, res) => {
    res.render('register.ejs')
})

app.post('/register', checkNotAuthenticated, registerUser)

app.delete('/logout', (req, res, next) => {
    req.logOut((err) => {
        if (err) {
            return next(err);
        }
        res.redirect('/login');
    })
})

app.get('/dashboard', checkAuthenticated, getMyLists, getMyFavorites, (req, res) => {
    res.render('dashboard.ejs', { name: req.user.name, myLists: req.myLists, favoriteLists: req.favoriteLists })
});

app.post('/dashboard', checkAuthenticated, findList) 

app.get('/dashboard/newlist', checkAuthenticated, (req, res) => {
    res.render('newList.ejs')
})

app.post('/dashboard/newlist', checkAuthenticated, createNewList)

app.get('/dashboard/list/:id', checkAuthenticated, (req, res, next) => { req.isCreator = true; return next(); }, getListInfo, getGifts, (req, res) => {
    res.render('creatorList.ejs', { list: list, gifts: gifts })
})

app.get('/list/:id', checkAuthenticated, (req, res, next) => { req.isCreator = false; return next(); }, getListInfo, checkIfSaved, getGifts, getGifterName, (req, res) => {
    console.log(gifts);
    res.render('list.ejs', { myid: req.user.id, list: list, gifts: gifts })
})

app.post('/list/:id', checkAuthenticated, addRemoveFavoritedList)

app.put('/list/:id', checkAuthenticated, (req, res) => {
    const giftId = req.query.id
    const reserve = req.query.reserve
    reserveGift(req.user.id, giftId, reserve)
})

app.get('/dashboard/list/:id/newgift', checkAuthenticated, checkIfCreator, (req, res) => {
    res.render('newGift.ejs', { listId: list.id })
})

app.post('/dashboard/list/:id/newgift', checkAuthenticated, addGift)

app.get('/register/whycreate', checkNotAuthenticated, (req, res) => {
    res.render('whyCreate.ejs')
})

app.get('/login/terms', checkNotAuthenticated, (req, res) => {
    res.render('terms.ejs')
})

// THIS IS CAUSING AN ERROR. FIGURE IT OUT
//The 404 Route
/*app.all('*', function(req, res){
    res.redirect('/dashboard');
});*/

app.listen(3000)



/*********************************
******      FUNCTIONS       ******
*********************************/

// Make sure a user is already logged in
function checkAuthenticated(req, res, next) {
    if(req.isAuthenticated()) {
        res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        return next()
    }

    res.redirect('/login')
}

// Make sure a user isn't logged in
function checkNotAuthenticated(req, res, next) {
    if(req.isAuthenticated()) {
        res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        return res.redirect('/dashboard')
    }
    next()
}

function checkIfCreator(req, res, next) {
    db.query("SELECT creator FROM lists WHERE id = ?", [req.params.id], function(err, data) {
        if(err) return res.json(err);
        if(data[0].creator == req.user.id)  {
            list.id = req.params.id
            return next()
        }
        else res.redirect('/list/' + req.params.id)
    })
}

// Register a new user
async function registerUser(req, res) {
    try {
        // The second argument in the bcrypt is how many times
        // to run it through the hash. 10 is pretty normal.
        const hashedPassword = await bcrypt.hash(req.body.password, 10)
        const q = "INSERT INTO members(`name`, `email`, `password`) VALUES (?)";
        const values = [
            req.body.name,
            req.body.email,
            hashedPassword
        ]

        db.query(q, [values], (err, data) => {
            if(err) return res.json(err);
            console.log(data.insertId);
            console.log("Created user successfully")
            res.redirect('/login')
        })
    } catch {
        res.redirect('/register')
    }
}

// Creates a new list
function createNewList(req, res) {
    try {
        const q = "INSERT INTO lists(`name`, `description`, `creator`) VALUES (?)";
        const values = [
            req.body.name,
            req.body.description, 
            req.user.id
        ]

        db.query(q, [values], (err, data) => {
            if(err) return res.json(err);
            console.log("Created list successfully")
            res.redirect('/dashboard/list/' + data.insertId)
        })
    } catch {
        res.redirect('/dashboard/newlist')
    }
}

// Gets the lists that the user created
function getMyLists(req, res, next) {
    db.query("SELECT * FROM lists WHERE creator = ?", [req.user.id], function(err, data) {
        if(err) return res.json(err);
        req.myLists = {}
        req.myLists = data
        return next();
    })
}

// Gets the lists that the user favorited
function getMyFavorites(req, res, next) {
    db.query("SELECT id, name FROM lists WHERE id = (SELECT listId FROM member_list WHERE memberId = ?)", [req.user.id], function(err, data) {
        if(err) return res.json(err);
        req.favoriteLists = {}
        req.favoriteLists = data;
        return next();
    })
}

// Go to a list (search function)
function findList(req, res) {
    db.query("SELECT * FROM lists WHERE id = ?", [req.body.list], function (err, data) {
        if(err) return res.json(err);
        if(Object.keys(data).length > 0) res.redirect('/list/' + req.body.list)
        else res.render('nolist.ejs')
    })
}

// Get list information
function getListInfo(req, res, next) {
    const listId = req.params.id
    db.query("SELECT * FROM lists WHERE id = ?", [listId], function(err, data) {
        if(err) return res.json(err);
        if(Object.keys(data).length > 0) {
            if(!req.isCreator && data[0].creator == req.user.id) return res.redirect('/dashboard/list/' + listId)
            else if(req.isCreator && data[0].creator != req.user.id) return res.redirect('/list/' + listId)
            list = data[0]
            return next()
        }
        else res.render('nolist.ejs')
    })
}

// See if current list is saved to user favorites
function checkIfSaved(req, res, next) {
    db.query("SELECT * FROM member_list WHERE memberId = ? AND listId = ?", [req.user.id, list.id], function(err, data) {
        if(err) return res.json(err);
        if(Object.keys(data).length > 0) list.isSaved = true
        else list.isSaved = false
        return next()
    })
}

// Get the gifts on a list
function getGifts(req, res, next) {
    const listId = req.params.id
    db.query("SELECT * FROM gifts WHERE list = ?", [listId], function(err, data) {
        if(err) return res.json(err);
        gifts = data
        return next()
    })
}

// Get the gifter name(if there is one) from members list
function getGifterName(req, res, next) {
    if(Object.keys(gifts).length > 0) {
        var counter = 0;
        Object.keys(gifts).forEach(key => {
            if(gifts[key].gifter !== null && gifts[key].gifter != req.user.id) {
                db.query("SELECT name FROM members WHERE id = ?", [gifts[key].gifter], function(err, data) {
                    if(err) console.log(err);
                    gifts[key].gifterName = data[0].name
                    counter++;
                    if(counter == Object.keys(gifts).length) return next()
                })
            }
            else {
                gifts[key]['gifterName'] = null
                counter++;
                if(counter == Object.keys(gifts).length) return next()
            }
        })
    }
    else {
        return next()
    }
}

function addGift(req, res) {
    try {
        var desc = req.body.description
        if(desc == '') desc = null
        var link = req.body.link
        if(link == '') link = null
        //var gifter = NULL
        
        const q = "INSERT INTO gifts(`list`, `gifter`, `title`, `description`, `link`) VALUES (?)";
        const values = [
            list.id,
            null,
            req.body.title, 
            desc, 
            link
        ]

        db.query(q, [values], (err, data) => {
            if(err) console.log(err);
            console.log("Created gift successfully")
            res.redirect('/dashboard/list/' + list.id)
        })
    } catch(e) {
        console.log(e)
        res.redirect('/dashboard/list/' + list.id + '/newgift')
    }
}

function addRemoveFavoritedList(req, res) {
    try {
        if(list.isSaved) {
            list.isSaved = false
            const q = "DELETE FROM member_list WHERE memberId = '?' AND listId = '?'"
            db.query(q, [req.user.id, list.id], (err, data) => {
                if(err) return res.json(err);
                console.log("Changed favorited list : " + list.isSaved);
            })
        }
        else {
            list.isSaved = true
            const q = "INSERT INTO member_list(`memberId`, `listId`) VALUES (?)"
            const values = [req.user.id, list.id]
            db.query(q, [values], (err, data) => {
                if(err) return res.json(err);
                console.log("Changed favorited list : " + list.isSaved);
            })
        }
    } catch(e) {
        console.log(e)
    }
}

function reserveGift(userId, giftId, reserve) {
    if(reserve == "true") {
        const q = "UPDATE gifts SET gifter = ? WHERE id = '?'"
        
        db.query(q, [parseInt(userId), parseInt(giftId)], (err, data) => {
            if(err) console.log(err);
            console.log("Updated Reservation");
        })
    }
    else {
        const q = "UPDATE gifts SET gifter = NULL WHERE id = ?"
        console.log("False")
        db.query(q, parseInt(giftId), (err, data) => {
            if(err) console.log(err);
            console.log("Updated Reservation");
        })
    }
}