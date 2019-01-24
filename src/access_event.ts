import { RTMClient, WebClient } from '@slack/client';
import * as fs from 'fs';

const csvfilePrefix = process.cwd().toString() + '/../data/';
const tokenfile = process.cwd().toString() + '/secure/slack_token';
const token = process.env.SLACK_TOKEN || fs.readFileSync(tokenfile).toString();
const rtm = new RTMClient(token);
rtm.start();

const web = new WebClient(token);
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
        const writer = csvWriter({headers: ['name', 'date', 'time', 'type'], sendHeaders: false});
        writer.pipe(fs.createWriteStream(csvfile, { flags: 'a+' }));
        writer.write([name, date, time, type]);
        writer.end();
    });
  })
