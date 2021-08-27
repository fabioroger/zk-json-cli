#!/usr/bin/env node

const [ ...args] = process.argv

process.argv = args

require ('../src/app.js')
