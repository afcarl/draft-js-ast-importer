import flatten from './flatten'
import camelCase from './camelCase'
import dataSchema from './dataSchema'
import {OrderedSet, List, Repeat, Map} from 'immutable'
import {
  CharacterMetadata,
  ContentBlock,
  ContentState,
  genKey,
} from 'draft-js'

/**
 * Compiler
 */
function compiler (ast, config = {}) {
  /**
   * Create an empty ContentState object
   */
  let entityContentState = ContentState.createFromText('')

  /**
   * Called for each node in the abstract syntax tree (AST) that makes up the
   * state contained in the store. We identify the node by `type`
   *
   * @param  {Array} Array representing a single node from the AST
   * @param  {Boolean} first Is the first item in the AST?
   * @param  {Boolean} last Is the last item in the AST?
   *
   * @return {Array} Result of the visit/render
   */
  function visit (node, opts) {
    const type = node[0]
    const content = node[1]
    const visitMethod = 'visit' + camelCase(type, true)
    return destinations[visitMethod](content, opts)
  }

  /**
   * A reference object so we can call our dynamic functions in `visit`
   * @type {Object}
   */
  const destinations = {

    /**
     * Called for each node that identifies as a 'block'. Identifies the block
     * _type_ function from the `renderers`
     *
     * @param  {Array} Array representing a single block node from the AST
     * @param  {Boolean} first Is the first item in the AST?
     * @param  {Boolean} last Is the last item in the AST?
     *
     * @return {Function} Result of the relevant `renderers.block[type]`
     * function
     */
    visitBlock (node, opts) {
      const childBlocks = []
      let depth = opts.depth || 0
      const type = node[dataSchema.block.type]
      const children = node[dataSchema.block.children]
      const data = Map(node[dataSchema.block.data])

      // Build up block content
      let text = ''
      let characterList = List()

      children.forEach((child) => {
        const type = child[0]
        const childData = visit(child, {depth: depth + 1})
        // Nested blocks will be added to the `blocks` array
        // when visited
        if (type === 'block') {
          childBlocks.push(childData)
        } else {
          // Combine the text and the character list
          text = text + childData.text
          characterList = characterList.concat(childData.characterList)
        }
      })

      const contentBlock = new ContentBlock({
        key: genKey(),
        text,
        type,
        characterList,
        depth,
        data,
      })

      return [contentBlock, childBlocks]
    },

    /**
     * Called for each node that identifies as a 'entity'. Identifies the
     * entity _type_ function from the `renderers`
     *
     * @param  {Array} Array representing a single entity node from the AST
     * @param  {Boolean} first Is the first item in the AST?
     * @param  {Boolean} last Is the last item in the AST?
     *
     * @return {Function} Result of the relevant `renderers.entity[type]`
     * function
     */
    visitEntity (node) {
      const type = node[dataSchema.entity.type]
      const mutability = node[dataSchema.entity.mutability]
      const data = node[dataSchema.entity.data]
      const children = node[dataSchema.entity.children]

      // Create the entity and note its key
      // run over all the children and aggregate them into the
      // format we need for the final parent block
      entityContentState = entityContentState.createEntity(
        type,
        mutability,
        data
      )
      const entityKey = entityContentState.getLastCreatedEntityKey()
      let text = ''
      let characterList = List()

      children.forEach((child) => {
        const childData = visit(child, {entityKey})
        // Combine the text and the character list
        text = text + childData.text
        characterList = characterList.concat(childData.characterList)
      })

      return {
        text,
        characterList,
      }
    },

    /**
     * Called for each node that identifies as a 'inline'. Identifies the
     * entity _type_ function from the `renderers`
     *
     * @param  {Array} Array representing a single inline node from the AST
     * @param  {Boolean} first Is the first item in the AST?
     * @param  {Boolean} last Is the last item in the AST?
     *
     * @return {Function} Result of the relevant `renderers.inline[type]`
     * function
     */
    visitInline (node, opts = {}) {
      const styles = node[dataSchema.inline.styles]
      const text = node[dataSchema.inline.text]

      // Convert the styles into an OrderedSet
      const style = OrderedSet(
        styles.map((style) => style)
      )

      // Create a List that has the style values for each character
      let charMetadata = CharacterMetadata.create({
        style,
        entity: opts.entityKey || null,
      })

      // We want the styles to apply to the entire range of `text`
      let characterMeta = Repeat(charMetadata, text.length)

      const characterList = characterMeta.toList()

      return {
        text,
        characterList,
      }
    },
  }

  if (ast.length > 0) {
    // Procedurally visit each node
    const blocks = flatten(ast.map(visit))
    // Build a valid ContentState that combines the blocks and the entity map
    // from the entityContentState
    return ContentState.createFromBlockArray(blocks, entityContentState.getEntityMap())
  } else {
    return ContentState.createFromText('')
  }
}

export default compiler
