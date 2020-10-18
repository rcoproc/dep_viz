import { findCompileDependencies } from './force_utils'

onmessage = function(e) {
  console.log('Message received', e)
  switch (e.data.type) {
    case 'init': return init(e.data.nodeData, e.data.targetObjects)
    default:
      console.error('Unexpected message type', e.data.type)
      return null
  }
}

function init(nodeData, targetObjects) {
  console.log('targetObjects', targetObjects);
  const causeRecompileMap = {}

  // TODO: Clean this up and send back to the main js file
  nodeData.forEach(node => {
    const deps = findCompileDependencies(targetObjects, node.id)
    console.log('node.id', node.id);

    for (const depId of Object.keys(deps)) {
      if (causeRecompileMap[depId]) {
        causeRecompileMap[depId].push(node.id)
      } else {
        causeRecompileMap[depId] = [node.id]
      }
    }
  })

  // This is working, although it's not distinguishing between export and
  // compile dependencies
  console.log('causeRecompileMap', causeRecompileMap);
}

// This script needs a copy of targetObjects graph
// For each node, calculate the nodes that will cause this node to be recompiled
// Stream results back to the main process?