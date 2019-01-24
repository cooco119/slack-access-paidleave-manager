"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@slack/client");
const fs = __importStar(require("fs"));
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
    rtm.on('message', message => {
        let name, date, time, type;
        let tmp;
        [tmp, type] = message.text.split(' : ');
        [name, date, time] = tmp.split(' ');
        name = name.split('(')[0];
        console.log([name, date, time, type]);
        const csvfile = csvfilePrefix + name + '.csv';
        const csvWriter = require('csv-write-stream');
        const writer = csvWriter({ headers: ['name', 'date', 'time', 'type'], sendHeaders: false });
        writer.pipe(fs.createWriteStream(csvfile, { flags: 'a+' }));
        writer.write([name, date, time, type]);
        writer.end();
    });
});
//# sourceMappingURL=access_event.js.map