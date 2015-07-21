import 'babel/polyfill'

import React from 'react/addons'
import classNames from 'classnames'

import EditorActions from '../flux/EditorActions'
import EditorStore from '../flux/EditorStore'
import { BASE_CHAR, EOF } from 'RichText'
import { elementPosition, scrollByToVisible } from 'dom'
import TextReplicaMixin from './TextReplicaMixin'
import TextInput from './TextInput'
import {ATTR, hasAttributeFor} from '../core/attributes'
import { lineContainingChar } from '../core/EditorUtils'
import { sourceOf } from '../core/replica'
import TextFontMetrics from '../core/TextFontMetrics'
import { logInGroup } from '../core/utils'

// TODO do this as a require or just make it part of the js or make it global?
require('text.less')

const T = React.PropTypes
const nbsp = String.fromCharCode(160)

export default React.createClass({
  propTypes: {
    id: T.number.isRequired,
    fonts: T.shape({
      regular: T.object,
      bold: T.object,
      boldItalic: T.object,
      italic: T.object
    }),
    fontSize: T.number.isRequired,
    minFontSize: T.number.isRequired,
    unitsPerEm: T.number.isRequired,
    width: T.number.isRequired,
    margin: T.number.isRequired
  },

  mixins: [TextReplicaMixin],

  getInitialState() {
    return EditorStore.getState()
  },

  componentWillMount() {
    TextFontMetrics.setConfig(this.props)

    this._createReplica()
    EditorActions.initialize(this.props, this.replica)
  },

  componentWillReceiveProps(nextProps) {
    TextFontMetrics.setConfig(this.props)
    EditorActions.initialize(nextProps, this.replica)
  },

  componentDidMount() {
    this.clickCount = 0
    this.caret = React.findDOMNode(this.refs.caret)

    EditorStore.listen(this.onStateChange)

    this.refs.input.focus()
  },

  componentDidUpdate() {
    if(!this.caret) {
      this.caret = React.findDOMNode(this.refs.caret)
    }
    if(this.caret) {
      let scrollByToCursor = scrollByToVisible(this.caret, 5)
      if(scrollByToCursor.xDelta !== 0 || scrollByToCursor.yDelta !== 0) {
        window.scrollBy(scrollByToCursor.xDelta, scrollByToCursor.yDelta)
      }
    }
  },

  componentWillUnmount() {
    EditorStore.unlisten(this.onStateChange)
  },

  onStateChange(state) {
    this.setState(state)
  },

  // todo should the replica stuff be in the store?
  _createReplica() {
    this.createTextReplica(this.props.id)
    this.registerCb(this._replicaInitCb, this._replicaUpdateCb)
  },

  _replicaInitCb(spec, op, replica) {  // eslint-disable-line no-unused-vars
    // set our own replica for future use
    this.replicaSource = sourceOf(spec)
    EditorActions.replicaUpdated()
  },

  _replicaUpdateCb(spec, op, replica) {  // eslint-disable-line no-unused-vars
    if(this.replicaSource === sourceOf(spec)) return
    EditorActions.replicaUpdated()
  },

  _mouseEventToCoordinates(e) {
    // hack: if the user clicks or rolls over their own cursor sometimes that becomes the target element (in browsers
    // that don't support pointer-events: none, like IE < 11): BUT we know the cursor is the current position
    if(e.target.className.indexOf('text-cursor-caret') >= 0) {
      return null
    }

    // target is the particular element within the editor clicked on, current target is the entire editor div
    let targetPosition = elementPosition(e.currentTarget)

    return {
      x: e.pageX - targetPosition.x,
      y: e.pageY - targetPosition.y
    }
  },

  _doOnSingleClick(e) {
    let coordinates = this._mouseEventToCoordinates(e)
    if(!coordinates) {
      return
    }

    if(e.shiftKey) {
      EditorActions.selectToCoordinates(coordinates)
    } else {
      EditorActions.navigateToCoordinates(coordinates)
    }
  },

  _doOnDoubleClick() {
    EditorActions.selectWordAtCurrentPosition()
  },

  _onMouseDown(e) {
    if(this.clickReset) {
      clearTimeout(this.clickReset)
      this.clickReset = null
    }
    let clickCount = this.clickCount
    this.clickCount += 1
    this.clickReset = setTimeout(() => {
      this.clickCount = 0
    }, 250)

    if(clickCount === 0) {
      this._doOnSingleClick(e)
    } else if (clickCount === 1) {
      // note that _doOnSingleClick has already executed here
      this._doOnDoubleClick(e)
    } //else if(this.clickCount === 2) // TODO handle triple-click

    e.preventDefault()
    e.stopPropagation()
  },

  _onMouseMove(e) {
    if(e.buttons !== 1) return

    let coordinates = this._mouseEventToCoordinates(e)
    if(!coordinates) return

    EditorActions.selectToCoordinates(coordinates)

    e.preventDefault()
    e.stopPropagation()
  },

  // DEBUGGING ---------------------------------------------------------------------------------------------------------

  _dumpReplica() {
    let text = this.replica.getTextRange(BASE_CHAR)
    console.debug('Current replica text: [' + text.map(c => c.char).join('') + ']')
    console.debug('Current replica contents:')
    console.dir(text)
    this.refs.input.focus()
  },

  _dumpPosition() {
    if(this.state.position) {
      console.debug('Current position:', this.state.position, 'positionEolStart:', this.state.positionEolStart)
    } else {
      console.debug('No active position')
    }
    this.refs.input.focus()
  },

  _dumpCurrentLine() {
    logInGroup('Line debug', () => {
      if(this.state.lines) {
        let printLine = l => console.debug(l.toString())

        let currentLine = lineContainingChar(this.replica, this.state.lines, this.state.position, this.state.positionEolStart)
        if(!currentLine) {
          console.log(null)
        } else {
          if (currentLine.index > 0) {
            logInGroup('Before', () => {
              printLine(this.state.lines[currentLine.index - 1])
            })
          }
          logInGroup('Current', () => {
            console.debug('index', currentLine.index, 'endOfLine', currentLine.endOfLine)
            printLine(currentLine.line)
          })
          if (currentLine.index < this.state.lines.length - 1) {
            logInGroup('After', () => {
              printLine(this.state.lines[currentLine.index + 1])
            })
          }
        }
      } else {
        console.debug('No lines')
      }
    })
    this.refs.input.focus()
  },

  _dumpLines() {
    if(this.state.lines) {
      console.debug('Current lines:', this.state.lines)
    } else {
      console.debug('No lines')
    }
    this.refs.input.focus()
  },

  _dumpSelection() {
    if(this.state.selectionActive) {
      let selectionChars = this.replica.getTextRange(this.state.selectionLeftChar, this.state.selectionRightChar)
      console.debug('Current selection contents: [' + selectionChars.map(c => c.char).join('') + ']')
      console.debug('Left=', this.state.selectionLeftChar)
      console.debug('Right=', this.state.selectionRightChar)
      console.debug('Anchor=', this.state.selectionAnchorChar)
      console.debug('Chars=', selectionChars)
    } else {
      console.debug('No active selection')
    }
    this.refs.input.focus()
  },

  _forceFlow() {
    EditorActions.replicaUpdated()
    this.refs.input.focus()
  },

  _forceRender() {
    this.forceUpdate(() => console.debug('Render done.'))
    this.refs.input.focus()
  },

  _togglePositionEolStart() {
    // state should only be set from the store, but for debugging this is fine
    this.setState(previousState => {
      let previous = previousState.positionEolStart
      console.debug('Toggling positionEolStart from ' + previous + ' to ' + !previous)
      return { positionEolStart: !previous }
    })
    this.refs.input.focus()
  },

  // RENDERING ---------------------------------------------------------------------------------------------------------

  _searchLinesWithSelection() {
    if(!this.state.lines || this.state.lines.length === 0 || !this.state.selectionActive) {
      return null
    }

    let left = lineContainingChar(this.replica, this.state.lines, this.state.selectionLeftChar)
    let right = lineContainingChar(this.replica, this.state.lines.slice(left.index), this.state.selectionRightChar, null)

    return {
      left: left.index,
      right: right.index + left.index
    }
  },

  _renderSelectionOverlay(lineIndex, lineHeight) {
    if(!this.state.selectionActive) {
      return null
    }

    let selectionDiv = (leftX, widthX) => {
      let height = Math.round(lineHeight * 10) / 10
      return (
        <div className="text-selection-overlay text-htmloverlay ui-unprintable text-htmloverlay-under-text"
          style={{top: 0, left: leftX, width: widthX, height: height}}></div>
      )
    }

    let line = this.state.lines[lineIndex]

    if(line && line.isEof() && this.state.selectionRightChar === EOF) {
      return selectionDiv(0, TextFontMetrics.advanceXForSpace(this.props.fontSize))
    }

    if(!line
      || line.isEof()
      || this.replica.compareCharPos(this.state.selectionLeftChar, line.end) > 0
      || this.replica.compareCharPos(this.state.selectionRightChar, line.start) < 0) {
      return null
    }

    let left = null
    let right = null

    if(this.replica.compareCharPos(this.state.selectionLeftChar, line.start) < 0) {
      left = line.start
    } else {
      left = this.state.selectionLeftChar
    }

    if(this.replica.compareCharPos(this.state.selectionRightChar, line.end) > 0) {
      right = line.end
    } else {
      right = this.state.selectionRightChar
    }

    // TODO change selection height and font size dynamically
    let leftChars = this.replica.getTextRange(line.start, left)
    let selectionLeftX = TextFontMetrics.advanceXForChars(this.props.fontSize, leftChars)

    let selectionWidthX
    let selectionAddSpace
    if((right === EOF && line.isEof()) || (!line.isEof() && this.replica.charEq(right, line.end) && !this.replica.charEq(left, right))) {
      // shortcut when we select to end of line, we already know the line advance from the flow algorithm
      selectionWidthX = line.advance - selectionLeftX
      selectionAddSpace = line.isEof() || line.end.char === '\n'
    } else {
      let selectionChars = this.replica.getTextRange(left, right)
      if(selectionChars.length === 0) {
        return null
      }
      selectionWidthX = TextFontMetrics.advanceXForChars(this.props.fontSize, selectionChars)
      selectionAddSpace = selectionChars[selectionChars.length - 1].char === '\n'
    }

    if(selectionAddSpace) {
      selectionWidthX += TextFontMetrics.advanceXForSpace(this.props.fontSize)
    }

    return selectionDiv(selectionLeftX, selectionWidthX)
  },

  _renderStyledText(id, text, attributes) {
    let hasAttribute = hasAttributeFor(attributes)

    // vertical alignment
    let superscript = hasAttribute(ATTR.SUPERSCRIPT)
    let subscript = hasAttribute(ATTR.SUBSCRIPT)
    let verticalAlign = classNames({
      super: superscript,
      sub: subscript,
      baseline: !(superscript || subscript)
    })

    // font size, weight, style
    let fontSize = TextFontMetrics.fontSizeFromAttributes(this.props.fontSize, attributes)
    let fontWeight = hasAttribute(ATTR.BOLD) ? 'bold' : 'normal'
    let fontStyle = hasAttribute(ATTR.ITALIC) ? 'italic' : 'normal'

    // text-decoration
    let underline = hasAttribute(ATTR.UNDERLINE)
    let strikethrough = hasAttribute(ATTR.STRIKETHROUGH)
    let textDecoration = classNames({
      none: !(underline || strikethrough),
      underline: underline,
      'line-through': strikethrough
    })

    let style = {
      color: '#000000',
      backgroundColor: 'transparent',
      fontFamily: 'Open Sans',  // TODO test other fonts, make the font selectable
      fontSize: fontSize,
      fontWeight: fontWeight,
      fontStyle: fontStyle,
      fontVariant: 'normal',
      textDecoration: textDecoration,
      verticalAlign: verticalAlign
    }

    return (
      <span style={style} key={id}>{text}</span>
    )
  },

  _splitIntoLines() {
    if(!this.state.lines) return []

    let chunkToStyledText = chunk => this._renderStyledText(chunk.text[0].id,
      chunk.text.map(c => c.char === ' ' ? nbsp : c.char).join(''), chunk.attributes)

    return this.state.lines.map(line => line.chunks.map(chunkToStyledText))
  },

  _renderLine(line, index, lineHeight, shouldRenderSelection) {
    let blockHeight = 10000
    let blockTop = TextFontMetrics.top(this.props.fontSize) - blockHeight

    let renderSelectionOverlay = () => shouldRenderSelection ? this._renderSelectionOverlay(index, lineHeight) : null

    // TODO set lineHeight based on font sizes used in line chunks
    // the span wrapper around the text is required so that the text does not shift up/down when using superscript/subscript
    return (
      <div className="text-lineview" style={{height: lineHeight, direction: 'ltr', textAlign: 'left'}} key={index}>
        {renderSelectionOverlay()}
        <div className="text-lineview-content" style={{marginLeft: 0, paddingTop: 0}}>
          <span style={{display: 'inline-block', height: blockHeight}}></span>
          <span style={{display: 'inline-block', position: 'relative', top: blockTop}}>
            <span key="text" className="editor-inline-block text-lineview-text-block">{line}</span>
          </span>
        </div>
      </div>
    )
  },

  _cursorPosition(lineHeight) {
    // the initial render before the component is mounted has no position or lines
    if (!this.state.position || !this.state.lines || this.state.lines.length === 0) {
      return null
    }

    let {line, index, endOfLine} = lineContainingChar(this.replica, this.state.lines, this.state.position, this.state.positionEolStart)
    let previousLineHeights = line ? lineHeight * index : 0

    let cursorAdvanceX

    if(!line || (endOfLine && this.state.positionEolStart && index < this.state.lines.length - 1)) {
      cursorAdvanceX = 0
    } else {
      let positionChars = this.replica.getTextRange(line.start, this.state.position)
      cursorAdvanceX = TextFontMetrics.advanceXForChars(this.props.fontSize, positionChars)
    }

    return {
      left: this.props.margin + cursorAdvanceX,
      top: previousLineHeights
    }
  },

  _renderInput(cursorPosition) {
    let position = cursorPosition ? cursorPosition.top : 0

    return (
      <TextInput id={this.props.id} ref="input" position={position}/>
    )
  },

  _renderCursor(cursorPosition, lineHeight) {
    if (this.state.selectionActive) {
      return null
    }

    // the initial render before the component is mounted has no position
    if (!cursorPosition) {
      return null
    }

    let cursorClasses = classNames('text-cursor', 'ui-unprintable', {
      'text-cursor-blink': !this.state.cursorMotion
    })

    let italicAtPosition = this.state.position.attributes && this.state.position.attributes[ATTR.ITALIC]
    let italicActive = this.state.activeAttributes && this.state.activeAttributes[ATTR.ITALIC]
    let italicInactive = this.state.activeAttributes && !this.state.activeAttributes[ATTR.ITALIC]

    let caretClasses = classNames('text-cursor-caret', {
      'text-cursor-italic': italicActive || (italicAtPosition && !italicInactive)
    })

    let cursorStyle = {
      opacity: 1,
      left: cursorPosition.left,
      top: cursorPosition.top
    }

/*
    cursorStyle.opacity = 0
    cursorStyle.display = 'none'
    cursorStyle.visibility = 'hidden'
*/
    let cursorHeight = Math.round(lineHeight * 10) / 10

    return (
      <div className={cursorClasses} style={cursorStyle} key="cursor" ref="cursor">
        <div className={caretClasses} style={{borderColor: 'black', height: cursorHeight}} key="caret" ref="caret"></div>
        <div className="text-cursor-top" style={{opacity: 0, display: 'none'}}></div>
        <div className="text-cursor-name" style={{opacity: 0, display: 'none'}}></div>
      </div>
    )
  },

  // TODO cursor is rendered at the document level in docs, we could do editor-level
  // TODO can do the onClick handler at at a higher level too, that way we can click outside elements e.g. before and after line ends
  render() {
    //console.trace('render')
    let lineHeight = TextFontMetrics.lineHeight(this.props.fontSize)
    let lines = this._splitIntoLines()
    let cursorPosition = this._cursorPosition(lineHeight)
    let linesWithSelection = this._searchLinesWithSelection()

    let shouldRenderSelection = index =>
      linesWithSelection != null && index >= linesWithSelection.left && index <= linesWithSelection.right

    return (
      <div>
        <div onMouseDown={this._onMouseDown} onMouseMove={this._onMouseMove}>
          {this._renderInput(cursorPosition)}
          <div className="text-contents">
            { lines.length > 0 ?
              lines.map((line, index) => this._renderLine(line, index, lineHeight, shouldRenderSelection(index)) ) :
              this._renderLine(nbsp, 0, lineHeight, false)}
          </div>
          {this._renderCursor(cursorPosition, lineHeight)}
        </div>
        {/*
        <div style={{position: 'relative', zIndex: 100, paddingTop: 30}}>
          <span>Dump:&nbsp;</span>
          <button onClick={this._dumpReplica}>Replica</button>&nbsp;
          <button onClick={this._dumpPosition}>Position</button>&nbsp;
          <button onClick={this._dumpCurrentLine}>Line</button>&nbsp;
          <button onClick={this._dumpLines}>All Lines</button>&nbsp;
          <button onClick={this._dumpSelection}>Selection</button><br/>
          <span>Force:&nbsp;</span>
          <button onClick={this._forceRender}>Render</button>&nbsp;
          <button onClick={this._forceFlow}>Flow</button><br/>
          <span>Action:&nbsp;</span>
          <button onClick={this._togglePositionEolStart}>Toggle Position EOL Start</button><br/>
        </div>
        */}
      </div>
    )
  }

})
