const WebSocket = require('ws')
const uuid = require('uuid/v1')
const SHA256 = require('crypto-js/sha256')
const Realm = require('realm')
const {defaultPort} = require('../config')

const [_, root, port = defaultPort, ...bootHosts] = process.argv
let peers = {}

const MessageSchema = {
  name: 'Message',
  primaryKey: 'id',
  properties: {
    id: 'string',
    text: 'string'
  }
}

const writeMessage = async (id, text) => {
  const realm = await Realm.open({
    schema: [MessageSchema]
  })

  return realm.write(() => {
    realm.create('Message', {id, text})
  })
}

const findMessage = async (id) => {
  const realm = await Realm.open({
    schema: [MessageSchema]
  })

  return realm.objects('Message').filtered('id = $0', id)
}

const broadcastToAllPeers = (peers, message) => {
  Object.values(peers).forEach((connection) => {
    if(connection.readyState === WebSocket.OPEN){
      connection.send(message) 
    }
  })
}

const addPeerConnection = (connection) => {
  const id = uuid()

  console.log('new peer connected')

  connection.on('message', async (message) => {
    const text = message.toString()
    const id = SHA256(text).toString()
    
    const [messageExists] = await findMessage(id)

    console.log('message:', text)

    if(!!messageExists) return false

    try {
      await writeMessage(id, text)
      broadcastToAllPeers(peers, text)
    } catch(err){
      console.log('error writing new message')
    }
  })

  const removePeer = () => {
    const {[id]: _, ...rest} = peers
    peers = rest
    console.log('peer disconnected')
  }

  connection.on('close', removePeer)
  connection.on('error', removePeer)

  peers = {
    ...peers,
    [id]: connection
  }
}

bootHosts.map((host) => {
  const client = new WebSocket(host)
  addPeerConnection(client)
})

const server = new WebSocket.Server({ port })

server.on('connection', addPeerConnection)