// Basically, if we're in dev mode, require dotenv for our .env file
if(process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

const express = require('express')
const app = express()
const mysql = require('mysql2')
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
        console.log(err);
    }
});

// We're going to require our passport-config file so we can
// send passport through that file
const initializePassport = require('./passport-config')
initializePassport(passport, db)

const oneDay = 1000 * 60 * 60 * 24;
var list = {}, gifts = {}, myLists = {}, favoriteLists = {}

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

app.post('/register', checkNotAuthenticated, registerUser, passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/register',
    failureFlash: true
}))

app.delete('/logout', (req, res, next) => {
    req.logOut((err) => {
        if (err) {
            return next(err);
        }
        res.redirect('/login');
    })
})

app.get('/dashboard', checkAuthenticated, getMyLists, getMyListsPictures, getMyFavorites, getMyFavoritesPictures, (req, res) => {
    res.render('dashboard.ejs', { user: req.user, myLists: myLists, favoriteLists: favoriteLists })
});

app.post('/dashboard', checkAuthenticated, findList)

app.post('/dashboard/updatesettings', checkAuthenticated, updateUserInfo)

app.post('/dashboard/newlist', checkAuthenticated, createNewList)

app.post('/dashboard/list/:id/updatelist', checkAuthenticated, updateListName)

app.delete('/dashboard/list/:id/deletelist', checkAuthenticated, deleteList, deleteGiftsFromList, deleteListMemberList, (req, res) => {
    res.redirect('/dashboard/')
})

app.get('/dashboard/list/:id', checkAuthenticated, (req, res, next) => { req.isCreator = true; console.log("beef"); return next(); }, getListInfo, getGifts, (req, res) => {
    res.render('creatorList.ejs', { user: req.user, list: list, gifts: gifts })
})

app.post('/dashboard/list/:id/newgift', checkAuthenticated, addGift)

app.post('/dashboard/list/:id/editgift', checkAuthenticated, editGift)

app.get('/list/:id', checkAuthenticated, (req, res, next) => { req.isCreator = false; return next(); }, getListInfo, checkIfSaved, getGifts, getGifterName, (req, res) => {
    res.render('list.ejs', { user: req.user, list: list, gifts: gifts })
})

app.post('/list/:id', checkAuthenticated, addRemoveFavoritedList)

app.put('/list/:id', checkAuthenticated, (req, res) => {
    const giftId = req.query.id
    const reserve = req.query.reserve
    reserveGift(req.user.id, giftId, reserve)
})

app.get('/register/whycreate', checkNotAuthenticated, (req, res) => {
    res.render('whyCreate.ejs')
})

app.get('/login/terms', checkNotAuthenticated, (req, res) => {
    res.render('terms.ejs')
})

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
    else res.redirect('/login')
}

// Make sure a user isn't logged in
function checkNotAuthenticated(req, res, next) {
    if(req.isAuthenticated()) {
        res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        return res.redirect('/dashboard')
    }
    else return next()
}

// Register a new user
async function registerUser(req, res, next) {
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
            if(err) {
                res.redirect('/register?e=' + encodeURIComponent(err.errno))
            }
            else {
                console.log("Created user successfully")
                return next()
            }
        })
    } catch {
        res.redirect('/register')
    }
}

function updateUserInfo(req, res) {
    try {
        const q = "UPDATE members SET name = ?, email = ?, picture = ? WHERE id = ?";
        var picture = req.body.picture;
        if(picture == '') picture = null;

        db.query(q, [req.body.name, req.body.email, picture, req.user.id], (err, data) => {
            if(err) console.log(err);
            console.log("Successfully updated user " + req.user.id)
            res.send()
        })
    } catch(e) {
        return console.log(e);
    }
}

// Creates a new list
function createNewList(req, res) {
    try {
        const q = "INSERT INTO lists(`name`, `description`, `creator`) VALUES (?)";
        const values = [
            req.body.newname,
            req.body.newdescription, 
            req.user.id
        ]

        db.query(q, [values], (err, data) => {
            if(err) return res.json(err);
            console.log("Created list successfully")
            res.redirect('/dashboard/list/' + data.insertId)
        })
    } catch(e) {
        console.log(e);
    }
}

function deleteList(req, res, next) {
    try {
        const listId = req.params.id
        const q = "DELETE FROM lists WHERE id=?";

        db.query(q, [listId], (err, data) => {
            if(err) console.log(err);
            console.log("Deleted list successfully - " + listId)
            return next()
        })
    } catch(e) {
        console.log(e);
    }
}

function deleteGiftsFromList(req, res, next) {
    try {
        const listId = req.params.id
        const q = "DELETE FROM gifts WHERE list=?";

        db.query(q, [listId], (err, data) => {
            if(err) console.log(err);
            console.log("Deleted gifts from list successfully - " + listId)
            return next()
        })
    } catch(e) {
        console.log(e);
    }
}

function deleteListMemberList(req, res, next) {
    try {
        const listId = req.params.id
        const q = "DELETE FROM member_list WHERE listId=?";

        db.query(q, [listId], (err, data) => {
            if(err) console.log(err);
            console.log("Deleted member_list successfully - " + listId)
            return next()
        })
    } catch(e) {
        console.log(e);
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

// Get the first four pictures from gifts on the list
function getMyListsPictures(req, res, next) {
    myLists = {};
    if(Object.keys(req.myLists).length > 0) {
        var counter = 0;
        Object.keys(req.myLists).forEach(key => {
            myLists[req.myLists[key].id] = { name: req.myLists[key].name, description: req.myLists[key].description }
            db.query("SELECT picture FROM gifts WHERE list = ? AND picture IS NOT NULL LIMIT 4", [req.myLists[key].id], function(err, data) {
                if(err) console.log(err);
                if(data.length > 0) {
                    var pictureArray = [];
                    for(var i = 0; i < data.length; i++) {
                        pictureArray.push(data[i].picture);
                    }
                    myLists[req.myLists[key].id]["pictures"] = pictureArray;
                }
                else myLists[req.myLists[key].id]["pictures"] = [];
                counter++;
                if(counter == Object.keys(req.myLists).length) return next()
            })
        })
    }
    else return next();
}

function updateListName(req, res) {
    let name = req.body.editname;
    let description = req.body.editdescription;

    const q = "UPDATE lists SET name = ?, description = ? WHERE id = ?"

    db.query(q, [name, description, parseInt(req.params.id)], (err, data) => {
        if(err) console.log(err);
        console.log("Updated List");
    })
}

// Gets the lists that the user favorited
function getMyFavorites(req, res, next) {
    db.query("SELECT * FROM lists WHERE id IN (SELECT listId FROM member_list WHERE memberId = ?)", [req.user.id], function(err, data) {
        if(err) return res.json(err);
        req.favoriteLists = {}
        req.favoriteLists = data;
        return next();
    })
}

function getMyFavoritesPictures(req, res, next) {
    favoriteLists = {};
    if(Object.keys(req.favoriteLists).length > 0) {
        var counter = 0;
        Object.keys(req.favoriteLists).forEach(key => {
            favoriteLists[req.favoriteLists[key].id] = { name: req.favoriteLists[key].name, description: req.favoriteLists[key].description }
            db.query("SELECT picture FROM members WHERE id = ?", [req.favoriteLists[key].creator], function(err, data) {
                if(err) console.log(err);
                favoriteLists[req.favoriteLists[key].id]["picture"] = data[0].picture;
                counter++;
                if(counter == Object.keys(req.favoriteLists).length) return next();
            })
        })
    }
    else return next();
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
            if(!req.isCreator && data[0].creator == req.user.id) res.redirect('/dashboard/list/' + listId)
            else if(req.isCreator && data[0].creator != req.user.id) res.redirect('/list/' + listId)
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
        var price = req.body.price
        if(price == '') price = null
        var size = req.body.size
        if(size == '') size = null
        var color = req.body.color
        if(color == '') color = null
        var details = req.body.details
        if(details == '') details = null
        var link = req.body.link
        if(link == '') link = null
        var picture = req.body.picture
        if(picture == '') picture = null
        
        const q = "INSERT INTO gifts(`list`, `gifter`, `title`, `details`, `link`, `size`, `color`, `price`, `picture`) VALUES (?)";
        const values = [
            list.id,
            null,
            req.body.title, 
            details, 
            link,
            size,
            color,
            price,
            picture
        ]

        db.query(q, [values], (err, data) => {
            if(err) console.log(err);
            console.log("Created gift successfully")
            res.redirect('/dashboard/list/' + list.id)
        })
    } catch(e) {
        console.log(e)
        res.redirect('/dashboard/list/' + list.id)
    }
}

function editGift(req, res) {
    try {
        var price = req.body.editprice
        if(price == '') price = null
        var size = req.body.editsize
        if(size == '') size = null
        var color = req.body.editcolor
        if(color == '') color = null
        var details = req.body.editdetails
        if(details == '') details = null
        var link = req.body.editlink
        if(link == '') link = null
        var picture = req.body.editpicture
        if(picture == '') picture = null
        
        const q = "UPDATE gifts SET `title` = ?, `details` = ?, `link` = ?, `size` = ?, `color` = ?, `price` = ?, `picture` = ? WHERE id = ?";
        const values = [
            req.body.edittitle, 
            details, 
            link,
            size,
            color,
            price,
            picture,
            req.query.giftId
        ]

        db.query(q, [req.body.edittitle, details, link, size, color, price, picture, req.query.giftId], (err, data) => {
            if(err) console.log(err);
            console.log("Edited gift #" + req.query.giftId +" successfully")
        })
    } catch(e) {
        console.log(e)
        res.redirect('/dashboard/list/' + list.id)
    }
}

function addRemoveFavoritedList(req, res) {
    try {
        if(list.isSaved) {
            list.isSaved = false
            const q = "DELETE FROM member_list WHERE memberId = '?' AND listId = '?'"
            db.query(q, [req.user.id, list.id], (err, data) => {
                if(err) return res.json(err);
            })
        }
        else {
            list.isSaved = true
            const q = "INSERT INTO member_list(`memberId`, `listId`) VALUES (?)"
            const values = [req.user.id, list.id]
            db.query(q, [values], (err, data) => {
                if(err) return res.json(err);
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
            console.log("Updated Reservation - true");
        })
    }
    else {
        const q = "UPDATE gifts SET gifter = NULL WHERE id = ?"
        db.query(q, parseInt(giftId), (err, data) => {
            if(err) console.log(err);
            console.log("Updated Reservation - false");
        })
    }
}

//The 404 Route
app.all('*', function(req, res){
    res.redirect('/dashboard');
});