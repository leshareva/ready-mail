"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const express = require('express');
const bodyParser = require('body-parser');
const mustacheExpress = require('mustache-express');
const cors = require('cors');
var crypto = require('crypto');
const app = express();
const port = process.env.PORT || 5000;
var Mailchimp = require('mailchimp-api-v3');
var mailchimp = new Mailchimp(config_1.foo);
app.engine('html', mustacheExpress());
app.use(cors({ origin: true }));
app.use('/static', express.static('static'));
app.set('view engine', 'html');
app.set('views', __dirname + '/../views');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get('/', (req, res) => {
    res.render('index');
});
app.post('/:listID', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const listID = req.params.listID;
        let fields = yield getMergeFields(listID);
        let tags = (req.query && req.query['tags']) ? req.query['tags'].split(',') : [];
        let body = convertReadymagBodyToMailchimpBody(req.body, fields, tags);
        saveToMailchimp(listID, [body]);
    }
    catch (e) {
        console.log(e);
    }
    res.send('Ok');
}));
app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});
const getMergeFields = (listID) => __awaiter(void 0, void 0, void 0, function* () {
    return mailchimp.get({
        path: `/lists/${listID}/merge-fields`
    }).then(el => el.merge_fields)
        .catch(console.log);
});
const saveToMailchimp = (listID, data) => __awaiter(void 0, void 0, void 0, function* () {
    //получаем каждого юзера, чтобы узнать есть он уже в подписчиках или нет
    let getUsers = data.map(user => {
        let hash = crypto.createHash('md5').update(user.email_address.toLowerCase()).digest("hex"); //для получения подписчика нужен hash — это email хэшированный md5 
        return {
            method: 'get',
            path: `/lists/${listID}/members/${hash}`
        };
    });
    //получаем всех пользователей одним запросом
    let users = yield mailchimp.batch(getUsers, {
        wait: true,
        interval: 2000,
        unpack: true,
    }).catch(e => {
        console.error(e);
        return [];
    }).filter(el => el.status !== 404);
    //для всех, кто уже есть в подписчиках, создаем пачку запросов на update
    let updateUsers = users.map(user => {
        let hash = crypto.createHash('md5').update(user.email_address.toLowerCase()).digest("hex");
        let dataUser = data.find(el => el.email_address === user.email_address);
        return {
            method: 'put',
            path: `/lists/${listID}/members/${hash}`,
            body: dataUser
        };
    });
    //для новых подписчиков создаём пачку post-запросов
    let newUsers = data.filter(el => {
        let check = users.find(user => user.email_address === el.email_address);
        return check ? false : true;
    }).map(el => {
        return {
            method: 'post',
            path: `/lists/${listID}/members`,
            body: el
        };
    });
    //мерджим обе пачки в одну
    let request = newUsers.concat(updateUsers);
    //отправляем всю пачку одним запросом
    yield mailchimp.batch(request, {
        wait: true,
        interval: 2000,
        unpack: true,
    });
});
const convertReadymagBodyToMailchimpBody = (body, fields = [], tags = []) => {
    let res = Object.keys(body).map(key => body[key]);
    let user = { status: 'subscribed', merge_fields: {}, tags: tags };
    res.forEach(el => {
        let entries = Object.entries(el)[0];
        let key = entries[0];
        let value = entries[1];
        let reg = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/gm;
        if (value.match(reg))
            user['email_address'] = value;
        let field = fields.find(el => el.name.toLowerCase() === key.toLowerCase());
        if (field) {
            user.merge_fields[field['tag']] = entries[1];
        }
    });
    if (!user['email_address'])
        throw Error('no email address');
    return user;
};
//# sourceMappingURL=index.js.map