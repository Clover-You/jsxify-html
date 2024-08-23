import * as cheerio from 'cheerio'
import type { ChildNode } from 'domhandler'
import { ElementType } from 'domelementtype'
import generate from '@babel/generator'

import type {
  BlockStatement,
  ExpressionStatement,
  JSXElement,
  JSXExpressionContainer,
  JSXText,
  Node,
} from '@babel/types'
import {
  addComment,
  blockStatement,
  expressionStatement,
  identifier,
  jsxClosingElement,
  jsxClosingFragment,
  jsxElement,
  jsxEmptyExpression,
  jsxExpressionContainer,
  jsxFragment,
  jsxIdentifier,
  jsxOpeningElement,
  jsxOpeningFragment,
  jsxText,
  objectExpression,
  objectProperty,
  stringLiteral,
} from '@babel/types'
import { encode } from 'html-entities'

import * as utils from './utils'
import { convertAttribute, createJSXAttribute } from './convert-attribute'

export function convert(html?: string): undefined | string {
  if (!utils.hasString(html))
    return undefined

  html = html?.trim()

  const $ = cheerio.load('', { xml: true })
  const htmlAst = $.parseHTML(html!)

  const babelAst = wrapWithFragment(htmlAst)

  let babelCode = generate(babelAst, { concise: true }).code

  if (babelCode.endsWith(';'))
    babelCode = babelCode.slice(0, -1)

  return babelCode
}

function wrapWithFragment(ast: ChildNode[]): Node {
  if (ast.length === 1) {
    return htmlToBabelAst(ast[0], true)
  }

  return expressionStatement(
    jsxFragment(
      jsxOpeningFragment(),
      jsxClosingFragment(),
      ast.flatMap(childNode => htmlToBabelAst(childNode, false)),
    ),
  )
}

function htmlToBabelAst(node: ChildNode, isRoot: true): ExpressionStatement | BlockStatement
function htmlToBabelAst(node: ChildNode, isRoot: false): (JSXElement | JSXExpressionContainer | JSXText)[]
function htmlToBabelAst(node: ChildNode, isRoot: boolean): ExpressionStatement | BlockStatement | (JSXElement | JSXExpressionContainer | JSXText)[] {
  if (node.type === ElementType.Tag) {
    const element = createJSXElement(node.name, node.attribs, node.childNodes)
    if (isRoot)
      return expressionStatement(element)
    return [element]
  }

  if (node.type === ElementType.Text) {
    const nodeValue = node.nodeValue
    return isRoot
      ? expressionStatement(stringLiteral(nodeValue))
      : [jsxText(encodeText(nodeValue).replace(/(\{+|\}+)/g, '{"$1"}'))]
  }

  if (node.type === ElementType.Comment) {
    if (isRoot) {
      const block = blockStatement([])
      addComment(block, 'inner', node.data, false)

      return block
    }
    const emptyExpression = jsxEmptyExpression()
    addComment(emptyExpression, 'inner', node.data, false)
    return [jsxExpressionContainer(emptyExpression)]
  }

  throw new Error(`Unknown node type: ${node.type}`)
}

function createJSXElement(tagName: string, attribs: Record<string, string | number>, children: ChildNode[]): JSXElement {
  const hasChildNodes = children.length > 0

  if (tagName === 'pre') {
    const htmlString = `${cheerio.load('').html(children)}`

    const preAttr = createJSXAttribute('dangerouslySetInnerHTML', objectExpression([
      objectProperty(identifier('__html'), stringLiteral(htmlString)),
    ]))

    const mergeAttrs = [...convertAttribute(attribs), preAttr]

    return jsxElement(
      jsxOpeningElement(
        jsxIdentifier('pre'),
        mergeAttrs,
        true,
      ),
      null,
      [],
    )
  }

  // generate(childrenJsxElements, { concise: true })
  return jsxElement(
    jsxOpeningElement(
      jsxIdentifier(tagName),
      convertAttribute(attribs),
      !hasChildNodes,
    ),
    jsxClosingElement(jsxIdentifier(tagName)),
    children.flatMap(node => htmlToBabelAst(node, false)!).filter(Boolean),
  )
}

function encodeText(text: string): string {
  return encode(text, { mode: 'nonAsciiPrintable', level: 'html5' })
}
