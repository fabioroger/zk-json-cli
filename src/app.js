const zookeeper = require('node-zookeeper-client')
const util = require('util')

const client = zookeeper.createClient(process.env.ZOOKEEPER || 'localhost:2181')

let resolveData = function (data) {
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
client.once('connected', async () => {

  const listSubTreeBFS = util.promisify(client.listSubTreeBFS.bind(client))
  const getData = util.promisify(client.getData.bind(client))
  const getACL = util.promisify(client.getACL.bind(client))

  const data = await listSubTreeBFS('/')
  const json = await data.reduce(async (accP, next) => {
    const acc = await accP
    try {
      const data = await getData(next)
      const acl = await getACL(next)
      acc[next] = {
        data: resolveData(data),
        acl
      }
    } catch (e) {
      console.log('Error fetching:', next, e)
    }
    return acc
  }, {})
  console.log(JSON.stringify(json))
  client.close()
})

client.connect()
