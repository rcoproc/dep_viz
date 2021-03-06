import lodashSortBy from 'lodash/sortBy'
import TinyQueue from 'tinyqueue'

import { depType } from './constants.js'

export function findCompileDependencies(graph, id) {
  return compileDependencies(graph, id, {[id]: true}, false)
}

// Find all the files that will cause this file to recompile
function compileDependencies(graph, id, matched, isCompileDep) {
  // A file that has an export dependency
  // Compilation dependencies are any dependency that is directly a compilation
  // dependency and  any dependency of a compilation dependency
  // Also include export depedency (but not it's children) in this analysis

  if (graph[id]) {
    graph[id].forEach(node => {
      switch (node.type) {
        case 'compile':
          if (!matched[node.id]) {
            matched[node.id] = true
            compileDependencies(graph, node.id, matched, true)
          }
          break

        case 'export':
          if (!matched[node.id]) {
            matched[node.id] = true
          }
          break

        case 'runtime':
          if (isCompileDep && !matched[node.id]) {
            matched[node.id] = true
            compileDependencies(graph, node.id, matched, true)
          }
          break

        default:
          throw `Unhandled node type ${node.type}`
      }
    })
  }

  return matched
}

export function findAllDependenciesTypes(graph, id) {
  return doFindAllDependenciesTypes(graph, id, {[id]: depType.compile}, true, false, id)
}

function doFindAllDependenciesTypes(graph, id, matched, topLevel, isCompileDep, selfVisitId) {
  // A file that has an export dependency
  // Compilation dependencies are any dependency that is directly a compilation
  // dependency and any dependency of a compilation dependency
  // Also include export depedency (but not it's children) in this analysis

  // If the node is already visited, then don't recurse
  // Unless the node was visited as a runtime dependency
  // As an optimization, start with all the compile time depdendencies

  if (graph[id]) {
    // Sort nodes by dependency type because we want to visit all compile
    // dependencies first (so that we preferentially mark nodes as compile time
    // depdency, because if a node is both a compile time dependency and a
    // export/runtime dependency then we treat it as a compile time dependency)
    const nodes = lodashSortBy(graph[id], node => {
      switch (node.type) {
        case 'compile': return 0
        case 'export': return 1
        case 'runtime': return 2
      }
    })

    nodes.forEach(node => {
      // This is needed do avoid a subtle bug. If the current node has a compile
      // dependency back on itself, then we need to treat all of it's runtime
      // dependencies as compile dependencies also, even though we may have
      // 'visited' the node already
      const needsSelfVisit = isCompileDep && selfVisitId === node.id
      if (!matched[node.id] || needsSelfVisit) {
        if (needsSelfVisit) selfVisitId = null
        if (isCompileDep) {
          matched[node.id] = depType.compile
          doFindAllDependenciesTypes(graph, node.id, matched, false, true, selfVisitId)
        } else {
          switch (node.type) {
            case 'compile':
              if (topLevel) {
                matched[node.id] = depType.compile
                doFindAllDependenciesTypes(graph, node.id, matched, false, true, selfVisitId)
              } else {
                matched[node.id] = depType.runtime
                doFindAllDependenciesTypes(graph, node.id, matched, false, false)
              }
              break

            case 'export':
              if (topLevel) {
                matched[node.id] = depType.export
              } else {
                matched[node.id] = depType.runtime
              }
              doFindAllDependenciesTypes(graph, node.id, matched, false, false)
              break

            case 'runtime':
              matched[node.id] = depType.runtime
              doFindAllDependenciesTypes(graph, node.id, matched, false, false)
              break

            default:
              throw `Unhandled node type ${node.type}`
          }
        }
      }
    })
  }

  return matched
}

export function findAllDependencies(graph, id) {
  let cur = [id]
  let next = []
  const visited = {}
  let depth = 0

  while (cur.length > 0 || next.length > 0) {
    const node = cur.shift()
    visited[node] = depth;

    (graph[node] || []).forEach(childNode => {
      const id = childNode.id || childNode
      if (!(id in visited)) {
        next.push(id)
      }
    })

    if (cur.length == 0) {
      cur = next
      next = []
      depth += 1
    }
  }

  return visited
}

// Returns an object that is hash map of links
// If the link is on the shortest path the value is 2
// If the link is not on the shortest path, the value is 1
//
// Implemented with breadth-first search
export function findPaths(graph, sourceId, targetId) {
  const visited = {}
  let cur = new TinyQueue([{id: sourceId, depth: 0}], d => d.depth)
  let next = new TinyQueue([], d => d.depth)

  while (cur.length > 0 || next.length > 0) {
    const node = cur.pop()
    if (visited[node.id]) {
      if (node.depth < visited[node.id].depth) {
        visited[node.id] = {depth: node.depth, node: node.id, parent: node.parent}
      }
    } else {
      visited[node.id] = {depth: node.depth, node: node.id, parent: node.parent}
    }

    const deps = graph[node.id] || []
    deps.forEach(childNode => {
      if(!(childNode.id in visited)) {
        next.push({id: childNode.id, parent: node.id, depth: node.depth + 1})
      }
    })

    if (cur.length === 0) {
      cur = next
      next = new TinyQueue([], d => d.depth)
    }
  }

  const shortest = calculateShortestPath(visited, targetId)
  return shortest
}

export function findCompilePaths(graph, sourceId, targetId) {
  const visited = {}
  let cur = new TinyQueue([{id: sourceId, depth: 0}], d => d.depth)
  let next = new TinyQueue([], d => d.depth)

  while (cur.length > 0 || next.length > 0) {
    const node = cur.pop()
    if (visited[node.id]) {
      if (node.depth < visited[node.id].depth) {
        visited[node.id] = {depth: node.depth, node: node.id, parent: node.parent}
      }
    } else {
      // Don't store the original node so that we can visit it later if we need
      // to (in case it is a compile dep of itself)
      if (node.depth > 0) {
        visited[node.id] = {depth: node.depth, node: node.id, parent: node.parent}
      }
    }

    const deps = graph[node.id] || []
    deps.forEach(childNode => {
      if(!(childNode.id in visited)) {
        if (node.depth === 0) {
          // Only find compile dependency paths
          if (childNode.type === 'compile') {
            next.push({id: childNode.id, parent: node.id, depth: node.depth + 1})
          }
        } else {
          next.push({id: childNode.id, parent: node.id, depth: node.depth + 1})
        }
      }
    })

    if (cur.length === 0) {
      cur = next
      next = new TinyQueue([], d => d.depth)
    }
  }

  const shortest = calculateShortestPath(visited, targetId)
  return shortest
}

// Need to detect when there isn't a matching path
function calculateShortestPath(visited, targetId) {
  const nodesInPath = [targetId]
  let next = targetId

  // TODO: This could use a refactoring
  let depth = visited[next] ? visited[next].depth + 1 : 0
  if (!visited[next]) return null

  while (visited[next] && visited[next].depth < depth) {
    const node = visited[next]
    if (!node) return null
    const parentId = node.parent

    nodesInPath.push(parentId)
    next = parentId
    depth = node.depth
  }

  return nodesInPath.reverse()
}
