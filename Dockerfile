FROM ubuntu:18.04
RUN apt-get update
RUN apt-get install -y curl gnupg gnupg2 
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -
RUN apt-get install -y nodejs 
RUN npm install -g yarn
RUN mkdir -p /code
WORKDIR /code
ADD package.json /code
RUN npm install
ADD . /code
RUN npm install -g typescript ts-node