const LocalStrategy = require('passport-local').Strategy
const bcrypt = require('bcrypt')

async function initialize(passport, connection) {
    const verifyCallback = (email, password, done)=>{
        connection.query('SELECT * FROM members WHERE email = ? ', [email], function(error, results, fields) {
            if (error) 
                return done(error);

            if(results.length==0)
            {
                return done(null,false, {message: 'No user with that email'});
            }
            const isValid = bcrypt.compare(password, results[0].password);
            user = { id: results[0].id, name: results[0].name, email: results[0].email, password: results[0].password };
            if(isValid)
            {
                return done(null, user);
            }
            else{
                return done(null, false);
            }
        });
    }

    passport.use(new LocalStrategy({usernameField: 'email'}, verifyCallback));

    passport.serializeUser((user, done)=>{
        done(null, user.id)
    });

    passport.deserializeUser(function(userId, done){
        connection.query('SELECT * FROM members where id = ?', [userId], function(error, results) {
            done(null, results[0]);    
        });
    });
}

module.exports = initialize