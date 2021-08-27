// noinspection BadExpressionStatementJS

const Zookeeper = require('node-zookeeper-client')
const util = require('util')
const fs = require('fs')
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
  .scriptName('zk-json-cli')
  .usage('$0 <cmd> [args]')
  .strictCommands()
  .demandCommand(1)
  .command('export [path]', 'export zookeeper path to json', yargs => {
    addFileOption(yargs)
    addZookeeperOption(yargs)
    addPathPositional(yargs)
  }, exportPath)
  .command('import [path]', 'import json into zookeeper', yargs => {
    addFileOption(yargs)
    addZookeeperOption(yargs)
    addPathPositional(yargs)
  }, importPath)
  .command('exists [path]', 'exists with error code 0 if it exists, -1 if it doesnt', yargs => {
    addZookeeperOption(yargs)
    addPathPositional(yargs)
  }, existsPath)
  .help()
  .argv

function addZookeeperOption(yargs) {
  yargs.option('zookeeper', {
    alias: 'zk',
    demandOption: true,
    default: process.env.ZOOKEEPER || 'localhost:2181',
    describe: 'zookeeper endpoint',
    type: 'string'
  })
}

function addFileOption(yargs) {
  yargs.option('file', {
    alias: 'f',
    demandOption: true,
    default: '-',
    describe: 'file input/output',
    type: 'string'
  })
}

function addPathPositional(yargs) {
  yargs.positional('path', {
    type: 'string',
    default: '/',
    describe: 'path to export'
  })
}

function exportPath({ path, zookeeper, file }) {
  const client = Zookeeper.createClient(zookeeper)

  client.once('connected', async () => {
    const listSubTreeBFS = util.promisify(client.listSubTreeBFS.bind(client))
    const getData = util.promisify(client.getData.bind(client))
    const close = util.promisify(client.close.bind(client))
    const acc = {}
    const data = await listSubTreeBFS(path)
    console.error('Exporting', data.length, 'entries...')
    for await (const next of data) {
      const data = await getData(next)
      acc[next] = tryConvertingToHumanReadableData(data)
    }
    fs.writeFileSync(file === '-' ? 1 : file, JSON.stringify(acc))
    console.error('Done.')
    await close()
  })

  client.connect()
}

async function importPath({ file, zookeeper }) {
  const client = Zookeeper.createClient(zookeeper)

  client.once('connected', async () => {
    const exists = util.promisify(client.exists.bind(client))
    const create = util.promisify(client.create.bind(client))
    const setData = util.promisify(client.setData.bind(client))
    const close = util.promisify(client.close.bind(client))
    const json = JSON.parse(fs.readFileSync(file === '-' ? 0 : file).toString())

    let entries = Object.entries(json)
    console.error('Importing', entries.length, 'entries...')
    for (const [path, value] of entries) {
      if (await exists(path)) {
        setData(path, getDataFromFile(value), -1)
      } else {
        create(path, getDataFromFile(value))
      }
    }

    console.error('Done.')

    await close()
  })

  client.connect()
}

async function existsPath({ path, zookeeper }) {
  const client = Zookeeper.createClient(zookeeper)

  client.once('connected', async () => {
    const exists = util.promisify(client.exists.bind(client))
    process.exit(await exists(path) ? 0 : 1)
  })

  client.connect()
}

function tryConvertingToHumanReadableData(data) {
  if (!data) {
    return
  }
  const text = data.toString()
  let isHumanReadable = /[^\000-\031]+/g.test(text)
  if (isHumanReadable) {
    try {
      const json = JSON.parse(text)
      return { json }
    } catch (e) {
      return { text }
    }
  } else {
    return { base64: data.toString('base64') }
  }
}

function getDataFromFile(value) {
  return value.json && Buffer.from(JSON.stringify(value.json)) ||
    value.text && Buffer.from(value.text) ||
    Buffer.from(value.base64, 'base64')
}
