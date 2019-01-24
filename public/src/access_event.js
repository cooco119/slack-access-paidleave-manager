"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@slack/client");
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const csvfilePrefix = process.cwd().toString() + '/../data/';
const tokenfile = process.cwd().toString() + '/secure/slack_token';
const token = process.env.SLACK_TOKEN || fs.readFileSync(tokenfile).toString();
const rtm = new client_1.RTMClient(token);
rtm.start();
const web = new client_1.WebClient(token);
web.channels.list()
    .then((res) => {
    const access_channel = res.channels.find(c => c.is_member);
    console.log(access_channel);
    if (access_channel) {
        rtm.on('message', (message) => __awaiter(this, void 0, void 0, function* () {
            let name, date, time, type;
            let tmp;
            if (message.text.split(' : ').length === 2) {
                [tmp, type] = message.text.split(' : ');
                [name, date, time] = tmp.split(' ');
                name = name.split('(')[0];
                console.log([name, date, time, type]);
            }
            else {
                console.log("다른 형식의 메세지. parse 시도.");
                if (message.text.indexOf('퇴근') !== -1) {
                    const user = message.user;
                    const queryString = require('query-string');
                    const data = {
                        'token': token,
                        'user': user
                    };
                    const url = 'https://slack.com/api/users.info?' + queryString.stringify(data);
                    name = yield axios_1.default.get(url, {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    })
                        .then((response) => {
                        if (response.status === 200) {
                            response = response.data;
                            return response.user.real_name;
                        }
                    });
                    type = '퇴근';
                    const tmp_date = new Date(message.ts * 1000);
                    date = tmp_date.getFullYear().toString() + '.' + (tmp_date.getMonth() + 1).toString() + '.' + tmp_date.getDate().toString();
                    time = tmp_date.getHours() + ':' + tmp_date.getMinutes() + ':' + tmp_date.getSeconds();
                    console.log([name, date, time, type]);
                }
                else if (message.text.indexOf('외출') !== -1) {
                    const user = message.user;
                    const queryString = require('query-string');
                    const data = {
                        'token': token,
                        'user': user
                    };
                    const url = 'https://slack.com/api/users.info?' + queryString.stringify(data);
                    console.log('url: ' + url);
                    name = yield axios_1.default.get(url, {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    })
                        .then((response) => {
                        if (response.status === 200) {
                            response = response.data;
                            console.log('가져온 username: ' + response.user.real_name);
                            return response.user.real_name;
                        }
                    });
                    type = '외출';
                    const tmp_date = new Date(message.ts * 1000);
                    date = tmp_date.getFullYear().toString() + '.' + (tmp_date.getMonth() + 1).toString() + '.' + tmp_date.getDate().toString();
                    time = tmp_date.getHours() + ':' + tmp_date.getMinutes() + ':' + tmp_date.getSeconds();
                    console.log([name, date, time, type]);
                }
            }
            const csvfile = csvfilePrefix + name + '.csv';
            const csvWriter = require('csv-write-stream');
            const writer = csvWriter({ headers: ['name', 'date', 'time', 'type'], sendHeaders: false });
            writer.pipe(fs.createWriteStream(csvfile, { flags: 'a+' }));
            writer.write([name, date, time, type]);
            writer.end();
        }));
    }
});
//# sourceMappingURL=access_event.js.map