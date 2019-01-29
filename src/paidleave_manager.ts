import * as fs from 'fs';
import axios from 'axios';
import { RTMClient, WebClient } from '@slack/client';
import { Request } from 'express-serve-static-core';
import { Response } from 'express';
const { createMessageAdapter } = require('@slack/interactive-messages');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const csvWriter = require('csv-write-stream');
const Papa = require('papaparse');

export default class PaidleaveManager{
  token: string;
  rtm: RTMClient;
  web: WebClient;
  csvfilePrefix: string;
  // @ts-ignore Member 'slackInteractions' implicitly has an 'any' type.
  slackInteractions;

  constructor(){
    this.csvfilePrefix = process.cwd().toString() + '/../data/paidleave/';
    const tokenfile = process.cwd().toString() + '/secure/paidleave/slack_token';
    this.token = process.env.SLACK_TOKEN || fs.readFileSync(tokenfile).toString();
    this.rtm = new RTMClient(this.token);
    this.rtm.start();
    this.web = new WebClient(this.token);

    const signingFile = process.cwd().toString() + '/secure/paidleave/slack_signing_secret';
    const signingSecret = fs.readFileSync(signingFile).toString();
    this.slackInteractions = createMessageAdapter(signingSecret);
  }

  private async getUserName(user: string){
    const queryString = require('query-string');
    const data = {
      'token': this.token,
      'user': user
    };
    const url = 'https://slack.com/api/users.info?' + queryString.stringify(data);
    return await axios.get(url,{
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    .then((response) => {
      if (response.status === 200){
        response = response.data;
        // @ts-ignore Property 'user' does not exist on type 'AxiosResponse<any>'.
        return response.user.real_name;
      }
    });
  }

  private handleSlashCommandFullday(req: Request, res: Response){
    const responseUrl = req.body.response_url;
    let name, date, year, month, day;
    const type = '연차';
    if (req.body.text.split(' ').length > 2){
      const data = {
        "response_type": "ephemeral",
        "text": "오류: 입력 형식 불일치. 다음과 같이 입력하세요.\n /연차 [이름] [날짜 : YYYY.MM.DD]"
      }
      res.status(200).json(data);
      return;
    }
    try{
      [name, date] = req.body.text.split(' ');
      [year, month, day] = date.split('.');

      let testDate = new Date(year, month - 1, day);
      if (testDate.getFullYear().toString() !== year || (testDate.getMonth() + 1).toString() !== month || testDate.getDate().toString() !== day){
        const data = {
          "response_type": "ephemeral",
          "text": "오류: 존재하지 않는 날짜."
        }
        res.status(200).json(data);
        return;
      }
    }
    catch(e){
      const data = {
        "response_type": "ephemeral",
        "text": "오류: 입력 형식 불일치. 다음과 같이 입력하세요.\n /연차 [이름] [날짜 : YYYY.MM.DD]"
      }
      res.status(200).json(data);
    }
    try{
      const message = `${year}년 ${month}월 ${day}일에 연차를 사용하시겠습니까?`;
      const confirmText = `[${year}년 ${month}월 ${day}일에 연차 신청] 확실합니까?`;
      const data = {
          "response_type": "ephemeral",
          "text": "연차 신청",
          "attachments": [
              {
                  "text": message,
                  "fallback": "에러 발생, 다시 시도해주세요.",
                  "callback_id": "paidleave",
                  "color": "#3AA3E3",
                  "attachment_type": "default",
                  "actions": [
                      {
                          "name": "ok",
                          "text": "확인",
                          "type": "button",
                          "style": "danger",
                          "value": type + '_' + date,
                          "confirm": {
                              "title": confirmText,
                              "text": "잘못 신청후 취소하려면 관리자에게 문의하세요.",
                              "ok_text": "확인",
                              "dismiss_text": "취소"
                          }
                      },
                      {
                          "name": "cancle",
                          "text": "취소",
                          "type": "button",
                          "value": "cancle"
                      }
                  ]
              }
          ]
      }
      res.status(200).json(data);
    }
    catch(e){
      res.status(500);
    }
  }

  private handleSlashCommandHalfday(req: Request, res: Response){
    const responseUrl = req.body.response_url;
    let name, date, year, month, day, time;
    const type = '반차';
    if (req.body.text.split(' ').length !== 3){
      const data = {
        "response_type": "ephemeral",
        "text": "오류: 입력 형식 불일치. 다음과 같이 입력하세요.\n /반차 [이름] [날짜 : YYYY.MM.DD] [오전|오후]"
      }
      res.status(200).json(data);
      return;
    }
    try{
      [name, date, time] = req.body.text.split(' ');
      [year, month, day] = date.split('.');

      if (time !== '오전' && time !== '오후'){
        const data = {
          "response_type": "ephemeral",
          "text": "오류: '오전'이나 '오후' 중에서 입력해 주세요."
        }
        res.status(200).json(data);
        return;
      }
      let testDate = new Date(year, month - 1, day);
      if (testDate.getFullYear().toString() !== year || (testDate.getMonth() + 1).toString() !== month || testDate.getDate().toString() !== day){
        const data = {
          "response_type": "ephemeral",
          "text": "오류: 존재하지 않는 날짜."
        }
        res.status(200).json(data);
        return;
      }
      
    }
    catch(e){
      const data = {
        "response_type": "ephemeral",
        "text": "오류: 입력 형식 불일치. 다음과 같이 입력하세요.\n /반차 [이름] [날짜 : YYYY.MM.DD] [오전|오후]"
      }
      res.status(200).json(data);
    }
    try{
      const message = `${year}년 ${month}월 ${day}일에 ${time} 반차를 사용하시겠습니까?`;
      const confirmText = `[${year}년 ${month}월 ${day}일에 ${time} 반차 신청] 확실합니까?`;
      const data = {
          "response_type": "ephemeral",
          "text": "반차 신청",
          "attachments": [
              {
                  "text": message,
                  "fallback": "에러 발생, 다시 시도해주세요.",
                  "callback_id": "paidleave",
                  "color": "#3AA3E3",
                  "attachment_type": "default",
                  "actions": [
                      {
                          "name": "ok",
                          "text": "확인",
                          "type": "button",
                          "style": "danger",
                          "value": type + '(' + time + ')' + '_' + date,
                          "confirm": {
                              "title": confirmText,
                              "text": "잘못 신청후 취소하려면 관리자에게 문의하세요.",
                              "ok_text": "확인",
                              "dismiss_text": "취소"
                          }
                      },
                      {
                          "name": "cancle",
                          "text": "취소",
                          "type": "button",
                          "value": "cancle"
                      }
                  ]
              }
          ]
      }
      res.status(200).json(data);
    }
    catch(e){
      console.log(e);
      res.status(500);
    }
  }

  private async handleSlashCommandSearch(req: Request, res: Response, name: string){
    const responseUrl = req.body.response_url;
    let year, month, day, type;
    let message = '';
    let totalUse = '';
    const targetfile = this.csvfilePrefix + name + '.csv';

    try{
      await Papa.parse(fs.readFileSync(targetfile).toString(), {
        // @ts-ignore
        complete: (result) => {
          const length = result.data.length;
          console.log(result.data);
          totalUse = `총 사용 횟수 : ${result.data[length-2][5]}\n`;
          // @ts-ignore
          result.data.forEach(element => {
            if (element.length === 1 || element[0] === 'name'){
              return;
            }
            message += `\t${element[1]}년 ${element[2]}월 ${element[3]}일: ${element[4]}\n`;
          });
        }
      });
      message = totalUse + message;
    }
    catch(e){
      console.log(e);
      if (!fs.existsSync(targetfile)){
        message = '연차 사용 내역 없음';
      }
    }
    try{
      const data = {
          "response_type": "ephemeral",
          "text": "연차 사용 내역 조회",
          "attachments": [
              {
                  "text": message,
                  "fallback": "에러 발생, 다시 시도해주세요.",
                  "callback_id": "paidleave",
                  "color": "#3AA3E3",
              }
          ]
      }
      res.status(200).json(data);
    }
    catch(e){
      console.log(e);
      res.status(500);
    }
  }

  public start(){
    // Start interactive ui service
    let csvdata: Array<Object> = [];
    const port = 3002;
    const app = express();

    app.use('/actions', this.slackInteractions.expressMiddleware());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.post('/slash/fullday', this.handleSlashCommandFullday);
    app.post('/slash/halfday', this.handleSlashCommandHalfday);
    app.post('/slash/search', 
      // @ts-ignore
      async (req, res) =>{
        const user = req.body.user_id;
        const name = await this.getUserName(user);
        this.handleSlashCommandSearch(req, res, name);
      }
    );

    // @ts-ignore
    this.slackInteractions.action({ callbackId: 'paidleave' }, async (payload, respond) => {
      const action = payload.actions[0];
      const user = payload.user.id;
      const name = await this.getUserName(user);

      try{
        if (action.name === 'ok'){
          let type, date;
          [type, date] = action.value.split('_');
          let year, month, day;
          [year, month, day] = date.split('.');
  
          let used = 0;
          const targetfile = this.csvfilePrefix + name + '.csv';
          if (fs.existsSync(targetfile)){
            let csvdata: Array<Object> = [];
            await Papa.parse(fs.readFileSync(targetfile).toString(), {
              worker: true,
              // @ts-ignore
              step: (results) => {
                csvdata.push(results.data[0]);
              }
            })
            for (let i = 1; i < csvdata.length - 1; i++ ){
              // @ts-ignore
              if (year === csvdata[i][1] && month === csvdata[i][2] && day === csvdata[i][3]){
                const data = {
                  "response_type": "ephemeral",
                  // @ts-ignore
                  "text": `오류: 이미 해당 날짜에 ${csvdata[i][4]} 신청이 완료되었습니다.`
                }
                console.log("이미 데이터 있음");
                respond(data);
                return;
              }
            }
            const recent = csvdata[csvdata.length - 2];
            // @ts-ignore
            used = parseInt(recent[recent.length - 1]);
          }
          
          if (type === '연차'){
            used += 1;
          }
          else {
            used += 0.5;
          }
  
          // Write params into csv file.
          const csvfile = this.csvfilePrefix + name + '.csv';
          let sendHeaderOrNot: boolean = false;
          if (!fs.existsSync(csvfile)) sendHeaderOrNot = true;
          const writer = csvWriter({headers: ['name', 'year', 'month', 'day', 'type', 'used'], sendHeaders: sendHeaderOrNot});
          writer.pipe(fs.createWriteStream(csvfile, { flags: 'a+' }));
          writer.write([name, year, month, day, type, used]);
          writer.end();
  
          const channelMsg = `[${name}] ${year}년 ${month}월 ${day}일에 ${type} 사용 신청`;
          const data = {
            "response_type": "in_channel",
            "delete_original": "true",
            "text": channelMsg
          }
          respond(data);
        }
        else {
          const data = {
            "delete_original": "true"
          }
          respond(data);
        }
      }
      catch(e) { console.log(e) }
      return;
    });

    http.createServer(app).listen(port, () => {
      console.log(`paidleave manager server listening on port ${port}`);
    })
  }
}