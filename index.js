// Copyright (c) 2023 Joshua Schmitt
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit'
import favicon from 'express-favicon'
import bodyParser from 'body-parser';
import { Sequelize, DataTypes } from 'sequelize';
import { randomString } from '@quelabs/quelib'
import Fingerprint from 'express-fingerprint'
import RedisStoreRL from "rate-limit-redis";
import { createClient } from "redis";
import { expressjwt as jwt } from 'express-jwt';

const app = express();
// const sequelize = new Sequelize('sqlite::memory:');
const sequelize = new Sequelize('mariadb://shortit:shortit@mysql:3306/shortit');

const Url = sequelize.define('urls', {
    short: DataTypes.STRING,
    location: DataTypes.STRING,
});

Url.sync().then(() => { console.log("Urls synced") }).catch(console.error)

const redisClient = createClient({
  url: 'redis://redis:6379'
});
redisClient.connect().catch(console.error).then(() => { console.log("Connected to Redis") })

const limiter = rateLimit({
    windowMs: 5 * 1000, // 15 minutes
    message: 'Slow down! You are going too fast. Thats too many requests in a short period of time.',
    keyGenerator: function (req) {
	var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
        return {
            ip: ip,
            fingerprint: req.fingerprint.hash
        }
    },
    store: new RedisStoreRL({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
	max: 5, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers

})


const demoLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 15 minutes
    message: 'Slow down! You are going too fast. Thats too many requests in a short period of time.',
    keyGenerator: function (req) {
	var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
        return {
            ip: ip,
            fingerprint: req.fingerprint.hash
        }
    },
    store: new RedisStoreRL({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
	max: 10, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

app.set('view engine', 'ejs');

app.use(favicon(process.cwd() + '/public/favicon.png'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cloudflare.restore());
app.use(cors());
app.use(Fingerprint({
    parameters:[
        Fingerprint.useragent,
        Fingerprint.acceptHeaders,
        Fingerprint.geoip,
    ]
}));

async function newUrl(short, location) {
    return Url.findOne({ where: { short: short } }).then((url) => {
        if (url) {
            short = randomString(8);
            
            return newUrl(short, req.body.location).then((url) => {
                return url;
            });
        } else {
            return Url.create({
                short: short,
                location: location
            }).then((url) => {
                return url;
            });
        }
    });

}

app.get('/', function(req, res) {
    res.render('pages/index');
});


app.get('/pricing', function(req, res) {
    res.render('pages/pricing');
});


app.get('/faq', function(req, res) {
    res.render('pages/faq');
});

// app.get('/', async (req, res) => {
//     await Url.sync()
//     const allUrls = Url.findAll().then((urls) => {
//         var html = '<link rel="stylesheet" href="style.css"><h1>URLs</h1><ul>';
//         urls.forEach((url) => {
//             html += `<li><a href="/${url.short}">${url.short}</a> - <a href="${url.location}">${url.location}</a></li>`;
//         })
//         html += '</ul>';
//         return html;
//     });

//     res.send('Hello World! - <a href="/new">New</a><br />' + await allUrls);
// });

app.get('/new', (req, res) => {
    res.sendFile(process.cwd() + '/new.html');
});

app.get('/api/:short', limiter, (req, res) => {
    sequelize.sync().then(() => {
        Url.findOne({ where: { short: req.params.short } }).then((url) => {
            if (url) {
                res.send(url);
            } else {
                res.status(404).send('Not Found');
            }
        });
    });
});

app.get('/me', (req, res) => {
    res.send({
        ip: req.ip,
        visitorid: req.fingerprint.hash
    });
});

app.get('/wipe', limiter, async (req, res) => {
    sequelize.sync().then(() => {
        Url.destroy({ where: {} }).then(() => {
            res.send('Wiped');
        });
    });
});

app.get('/:short', (req, res) => {
    sequelize.sync().then(() => {
        Url.findOne({ where: { short: req.params.short } }).then((url) => {
            if (url) {
                res.redirect(url.location);
            } else {
                res.redirect('/');
            }
        });
    });
});

app.post('/avaiable', limiter, async (req, res) => {
    if (!req.body) return res.status(400).send('Bad Request (no body)');

    if (!req.body.short) {
        return res.status(400).send('Bad Request (missing short)');
    }

    sequelize.sync().then(() => {
        Url.findOne({ where: { short: req.body.short } }).then((url) => {
            if (url) {
                res.send(false);
            } else {
                res.send(true);
            }
        });
    });
});

app.post('/demo', demoLimiter, async (req, res) => {
    if (!req.body) return res.status(400).send('Bad Request (no body)');

    if (!req.body.location) {
        return res.status(400).send('Bad Request (missing location)');
    }
    const short = randomString(8);

    newUrl(short, req.body.location).then((url) => {
        res.send(url);
    });
});


app.post('/new', limiter, async (req, res) => {
    if (!req.body) return res.status(400).send('Bad Request (no body)');

    if (!req.body.location) {
        return res.status(400).send('Bad Request (missing location)');
    }



    sequelize.sync().then(() => {
        if (!req.body.short) req.body.short = randomString(8);

        if (req.body.short == req.body.location) {
            return res.status(400).send('Bad Request (short and location are the same)');
        }
        

        Url.findOne({ where: { short: req.body.short } }).then((url) => {
            if (url) {
                res.status(400).send('Bad Request (short already exists)');
            } else {
                newUrl(req.body.short, req.body.location).then((url) => {
                    res.send(url);
                });
            }
        });
    });
});

app.listen(3000, () => {
    console.log('Example app listening on port 3000!');
});
