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
/*
 * slack-access-paidleav-manager: access_manager.ts
 *
 *
 * Saves messages from slack channel where the bot is in,
 * and offers an interactive ui api backend which offers users to
 * search his/her own access history.
 *
 * 1. Prerequisites
 * (Reference to https://api.slack.com)
 *
 * - Slack app : https://api.slack.com/slack-apps
 *
 * - Add a bot
 *
 * - Required scopes : channels:history,
 *                     channels:read,
 *                     chat:write:bot,
 *                     users:read
 * ---> For information about scopes: https://api.slack.com/scopes
 *
 * - OAuth token for bot : Starts with 'xoxb-...'
 *
 * 2. Make copy slack token to a file secure/slack_token
 *
 * 3. To start, 'yarn start' at project root directory. (Uses ts-node)
 *
 */
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@slack/client");
const { createMessageAdapter } = require('@slack/interactive-messages');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const csvWriter = require('csv-write-stream');
const Papa = require('papaparse');
class AccessManager {
    constructor() {
        // @ts-ignore
        this.menuSelections = {};
        this.csvfilePrefix = process.cwd().toString() + '/../data/';
        const tokenfile = process.cwd().toString() + '/secure/slack_token';
        this.token = process.env.SLACK_TOKEN || fs.readFileSync(tokenfile).toString();
        this.rtm = new client_1.RTMClient(this.token);
        this.rtm.start();
        this.web = new client_1.WebClient(this.token);
        const signingFile = process.cwd().toString() + '/secure/slack_signing_secret';
        const signingSecret = fs.readFileSync(signingFile).toString();
        this.slackInteractions = createMessageAdapter(signingSecret);
    }
    getUserName(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const queryString = require('query-string');
            const data = {
                'token': this.token,
                'user': user
            };
            const url = 'https://slack.com/api/users.info?' + queryString.stringify(data);
            return yield axios_1.default.get(url, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            })
                .then((response) => {
                if (response.status === 200) {
                    response = response.data;
                    // @ts-ignore Property 'user' does not exist on type 'AxiosResponse<any>'.
                    return response.user.real_name;
                }
            });
        });
    }
    readAccessChannel() {
        /* readAccessChannel : Reads access channel and parse to csv file.
         *
         * If the message is not in the form, search the keywords and if exists,
         * get message info through web api and collect username.
         * The rest of data - date & time, is given in the 'message' data.
         *
         */
        this.web.channels.list()
            .then((res) => {
            // Find channel where bot is attending.
            // @ts-ignore Property 'channels' does not exist on type 'WebAPICallResult'.
            const access_channel = res.channels.find(c => c.is_member);
            if (access_channel) {
                // Subscribe 'message' event
                this.rtm.on('message', (message) => __awaiter(this, void 0, void 0, function* () {
                    let name, year, month, day, hour, minute, second, type;
                    let tmp, date, time;
                    // Parse the message if has given format
                    if (message.text.split(' : ').length === 2) {
                        [tmp, type] = message.text.split(' : ');
                        [name, date, time] = tmp.split(' ');
                        name = name.split('(')[0];
                        [year, month, day] = date.split('.');
                        [hour, minute, second] = time.split(':');
                        console.log([name, year, month, day, hour, minute, second, type]);
                    }
                    // For message that is not in the given format, 
                    // check if contains given keyword.
                    else {
                        console.log("다른 형식의 메세지(" + message.text + "). parse 시도.");
                        // keyword == '퇴근' 
                        if (message.text.indexOf('퇴근') !== -1) {
                            // From message, get user id
                            // Using that as an argument(as a urlencoded) to Web API(GET method), 
                            // We can get user info
                            const user = message.user;
                            name = yield this.getUserName(user);
                            // Set rest of params to save.
                            // Get date & time from message.ts, which is a unix timestamp.
                            type = '퇴근';
                            const tmp_date = new Date(message.ts * 1000);
                            year = tmp_date.getFullYear().toString();
                            month = (tmp_date.getMonth() + 1).toString();
                            day = tmp_date.getDate().toString();
                            hour = tmp_date.getHours().toString();
                            ;
                            minute = tmp_date.getMinutes().toString();
                            ;
                            second = tmp_date.getSeconds().toString();
                            ;
                            console.log([name, year, month, day, hour, minute, second, type]);
                        }
                        // keyword == '퇴근'
                        // Rest of what's below is same as upper keyword block
                        else if (message.text.indexOf('외출') !== -1) {
                            const user = message.user;
                            name = yield this.getUserName(user);
                            type = '외출';
                            const tmp_date = new Date(message.ts * 1000);
                            year = tmp_date.getFullYear().toString();
                            month = (tmp_date.getMonth() + 1).toString();
                            day = tmp_date.getDate().toString();
                            hour = tmp_date.getHours().toString();
                            ;
                            minute = tmp_date.getMinutes().toString();
                            ;
                            second = tmp_date.getSeconds().toString();
                            ;
                            console.log([name, year, month, day, hour, minute, second, type]);
                        }
                    }
                    // Write params into csv file.
                    const csvfile = this.csvfilePrefix + name + '.csv';
                    let sendHeaderOrNot = false;
                    if (!fs.existsSync(csvfile))
                        sendHeaderOrNot = true;
                    const writer = csvWriter({ headers: ['name', 'year', 'month', 'day', 'hour', 'minute', 'second', 'type'], sendHeaders: sendHeaderOrNot });
                    writer.pipe(fs.createWriteStream(csvfile, { flags: 'a+' }));
                    writer.write([name, year, month, day, hour, minute, second, type]);
                    writer.end();
                }));
            }
        });
    }
    handleSlashCommand(req, res) {
        const responseUrl = req.body.response_url;
        const data = {
            "response_type": "ephemeral",
            "text": "[내 출퇴근 기록 조회하기]",
            "attachments": [
                {
                    "text": "조회 범위 선택",
                    "fallback": "에러 발생, 다시 시도해주세요.",
                    "callback_id": "select_scope",
                    "color": "#3AA3E3",
                    "attachment_type": "default",
                    "actions": [
                        {
                            "name": "daily",
                            "text": "일별",
                            "type": "button",
                            "value": "daily"
                        },
                        {
                            "name": "monthly",
                            "text": "월별",
                            "type": "button",
                            "value": "monthly"
                        },
                        {
                            "name": "yearly",
                            "text": "연별",
                            "type": "button",
                            "value": "yearly"
                        }
                    ]
                }
            ]
        };
        res.status(200).json(data);
    }
    handleScope(value) {
        let templatefile;
        let data;
        if (value === 'daily') {
            templatefile = process.cwd() + '/src/ui_messages/daily_select_template.json';
            data = JSON.parse(fs.readFileSync(templatefile).toString());
            const currentYear = (new Date()).getFullYear();
            let yearOptions = [];
            for (let i = 2015; i <= currentYear; i++) {
                let yearOption = {
                    "text": i.toString() + '년',
                    "value": i.toString()
                };
                yearOptions.push(yearOption);
            }
            data.attachments[0].actions[0].options = yearOptions;
        }
        if (value === 'monthly') {
            templatefile = process.cwd() + '/src/ui_messages/monthly_select_template.json';
            data = JSON.parse(fs.readFileSync(templatefile).toString());
            const currentYear = (new Date()).getFullYear();
            let yearOptions = [];
            for (let i = 2015; i <= currentYear; i++) {
                let yearOption = {
                    "text": i.toString() + '년',
                    "value": i.toString()
                };
                yearOptions.push(yearOption);
            }
            data.attachments[0].actions[0].options = yearOptions;
        }
        if (value === 'yearly') {
            templatefile = process.cwd() + '/src/ui_messages/yearly_select_template.json';
            data = JSON.parse(fs.readFileSync(templatefile).toString());
            const currentYear = (new Date()).getFullYear();
            let yearOptions = [];
            for (let i = 2015; i <= currentYear; i++) {
                let yearOption = {
                    "text": i.toString() + '년',
                    "value": i.toString()
                };
                yearOptions.push(yearOption);
            }
            data.attachments[0].actions[0].options = yearOptions;
        }
        return data;
    }
    // Entrypoint
    start() {
        // Read access channel and save to csv
        this.readAccessChannel();
        // Start interactive ui service
        const port = 3000;
        const app = express();
        app.use('/slack/actions', this.slackInteractions.expressMiddleware());
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(bodyParser.json());
        app.post('/slack/slash', this.handleSlashCommand);
        // Add handler to ui actions 
        // @ts-ignore
        this.slackInteractions.action({ callback_id: 'select_scope', type: 'button' }, (payload, respond) => __awaiter(this, void 0, void 0, function* () {
            const user = payload.user.id;
            const name = yield this.getUserName(user);
            const value = payload.actions[0].value;
            const data = this.handleScope(value);
            if (value === 'daily') {
                // @ts-ignore
                this.menuSelections[name] = {
                    'year': null,
                    'month': null,
                    'day': null
                };
            }
            if (value === 'monthly') {
                // @ts-ignore
                this.menuSelections[name] = {
                    'year': null,
                    'month': null
                };
            }
            if (value === 'yearly') {
                // @ts-ignore
                this.menuSelections[name] = {
                    'year': null
                };
            }
            respond(data);
            return;
        }));
        // @ts-ignore
        this.slackInteractions.action({ type: 'select' }, (payload, respond) => __awaiter(this, void 0, void 0, function* () {
            const user = payload.user.id;
            const name = yield this.getUserName(user);
            const key = payload.actions[0].name;
            const value = payload.actions[0].selected_options[0].value;
            // @ts-ignore
            if (key === 'year')
                this.menuSelections[name].year = value;
            // @ts-ignore
            if (key === 'month')
                this.menuSelections[name].month = value;
            // @ts-ignore
            if (key === 'day')
                this.menuSelections[name].day = value;
            console.log('Added to option field');
            try {
                respond();
            }
            catch (e) {
                console.log(e);
            }
            return;
        }));
        // @ts-ignore
        this.slackInteractions.action({ callback_id: 'select_daily', type: 'button' }, (payload, respond) => __awaiter(this, void 0, void 0, function* () {
            console.log(payload);
            const user = payload.user.id;
            const name = yield this.getUserName(user);
            // @ts-ignore
            const targetyear = this.menuSelections[name].year;
            // @ts-ignore
            const targetmonth = this.menuSelections[name].month;
            // @ts-ignore
            const targetday = this.menuSelections[name].day;
            console.log('year: ' + targetyear + ', month: ' + targetmonth + ', day: ' + targetday);
            const targetfile = this.csvfilePrefix + name + '.csv';
            let csvdata = [];
            yield Papa.parse(targetfile, {
                worker: true,
                // @ts-ignore
                step: (results) => {
                    csvdata.push(results.data);
                    console.log(results.data);
                }
            });
            console.log(csvdata);
            let data = {};
            csvdata.forEach(element => {
                console.log(element);
            });
        }));
        http.createServer(app).listen(port, () => {
            console.log(`server listening on port ${port}`);
        });
    }
}
exports.default = AccessManager;
//# sourceMappingURL=access_manager.js.map