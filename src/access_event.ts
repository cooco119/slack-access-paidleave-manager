import { RTMClient, WebClient } from '@slack/client';
import * as fs from 'fs';
import axios from 'axios';

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
    if (access_channel){
      rtm.on('message', async message => {
          let name, date, time, type;
          let tmp;
          if (message.text.split(' : ').length === 2){
            [tmp, type] = message.text.split(' : ');
            [name, date, time] = tmp.split(' ');
            name = name.split('(')[0];
            console.log([name, date, time, type]);
          }
          else {
            console.log("다른 형식의 메세지. parse 시도.");
            
            if (message.text.indexOf('퇴근') !== -1){
              const user = message.user;
              const queryString = require('query-string');
              const data = {
                'token': token,
                'user': user
              };
              const url = 'https://slack.com/api/users.info?' + queryString.stringify(data);
              console.log('url: ' + url);
              name = await axios.get(url,{
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                }
              })
              .then((response) => {
                if (response.status === 200){
                  response = response.data;
                  console.log('가져온 username: ' + response.user.real_name);
                  return response.user.real_name;
                }
              });
              type = '퇴근';
              const tmp_date = new Date(message.ts * 1000);
              date = tmp_date.getFullYear().toString() + '.' + (tmp_date.getMonth() + 1).toString() + '.' + tmp_date.getDate().toString();
              time = tmp_date.getHours() + ':' + tmp_date.getMinutes() + ':' + tmp_date.getSeconds();
            }
          }
  
          const csvfile = csvfilePrefix + name + '.csv';
          const csvWriter = require('csv-write-stream');
          const writer = csvWriter({headers: ['name', 'date', 'time', 'type'], sendHeaders: false});
          writer.pipe(fs.createWriteStream(csvfile, { flags: 'a+' }));
          writer.write([name, date, time, type]);
          writer.end();
      });
    }
  })
