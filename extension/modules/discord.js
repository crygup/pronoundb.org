/*
 * Copyright (c) 2020-2021 Cynthia K. Rey, All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { h, css } from '../util/dom.js'
import { connect, invoke } from '../util/bridge.js'
import { fetchPronouns, fetchPronounsBulk } from '../util/fetch.js'
import { formatPronouns } from '../util/format.js'
import throttle from '../util/throttle.js'

// Author ID fetchers
function fetchMessageAuthors (ids) {
  const idMap = {}

  // Use old for to avoid transpilation
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const node = document.getElementById(`chat-messages-${id}`)
    if (!node) continue // happens when message just gets sent

    // seems like discord somehow makes reactInternalInstance static w/o the random part
    idMap[id] = node.__reactInternalInstance$.memoizedProps.children[2].props.message.author.id
  }

  return idMap
}

function fetchPoppedUser (id) {
  return document.getElementById(id)
    .__reactInternalInstance$.memoizedProps
    .children.props.children.props.children.props.userId
}

function fetchFocusedUser () {  
  return document.querySelector('div[class^="modal-"]')
    .__reactInternalInstance$.memoizedProps
    .children.props.children.props.user.id
}

function fetchAutocompleteRowIds (pointers) {
  const res = {}

  // Use old for to avoid transpilation
  for (let i = 0; i < pointers.length; i++) {
    const pointer = pointers[i]
    const row = document.querySelector(`[data-pronoundb-target="${pointer}"]`)
    if (!row) continue

    const reactKey = Object.keys(row).find(k => k.startsWith('__reactInternalInstance'))
    res[pointer] = row[reactKey].return.return.return.key
  }

  return res
}

// Handlers
async function handleMessages (nodes) {
  const ids = nodes.map(node => node.id.slice(14))
  const idMap = await invoke(fetchMessageAuthors, ids)
  const authors = Array.from(new Set(Object.values(idMap)))
  const pronounsMap = await fetchPronounsBulk('discord', authors)

  for (const id of ids) {
    const pronouns = pronounsMap[idMap[id]]
    const header = document.querySelector(`#chat-messages-${id} h2`)
    if (pronouns && header) {
      header.appendChild(
        h('span', { class: 'pronoundb-pronouns', style: css({ color: 'var(--text-muted)', fontSize: '.9rem' }) }, ` • ${formatPronouns(pronouns)}`)
      )
    }
  }
}

async function handleUserPopOut (node) {
  const id = await invoke(fetchPoppedUser, node.id)
  const pronouns = await fetchPronouns('discord', id)

  if (pronouns) {
    const frag = document.createDocumentFragment()
    frag.appendChild(h('div', { class: 'bodyTitle-Y0qMQz marginBottom8-AtZOdT size12-3R0845' }, 'Pronouns'))
    frag.appendChild(h('div', { class: 'marginBottom8-AtZOdT size14-e6ZScH' }, formatPronouns(pronouns)))
    node.querySelector('.bodyInnerWrapper-Z8WDxe').appendChild(frag)

    setTimeout(() => {
      const { y, height } = node.getBoundingClientRect()
      const bottom = window.innerHeight - y - height - 16
      if (bottom < 0) node.style.top = `${parseInt(node.style.top) + bottom}px`
    }, 5)
  }
}

async function handleUserModal (node) {
  const id = await invoke(fetchFocusedUser)
  const pronouns = await fetchPronouns('discord', id)

  if (pronouns) {
    const container = node.querySelector('.userInfoSection-2acyCx')
    container.classList.add('has-pronouns')

    const frag = document.createDocumentFragment()
    frag.appendChild(h('div', { class: 'userInfoSectionHeader-CBvMDh' }, 'Pronouns'))
    frag.appendChild(h('div', { class: 'marginBottom8-AtZOdT size14-e6ZScH colorStandard-2KCXvj' }, formatPronouns(pronouns)))
    container.appendChild(frag)
  }
}

let popoutIdCache = 0
async function handleAutocompleteRows (nodes) {
  const pointers = nodes.map((node) => node.dataset.pronoundbTarget = ++popoutIdCache)
  const idsMap = await invoke(fetchAutocompleteRowIds, pointers)
  const ids = Array.from(new Set(Object.values(idsMap)))
  const pronounsMap = await fetchPronounsBulk('discord', ids)

  for (const pointer of pointers) {
    const row = document.querySelector(`[data-pronoundb-target="${pointer}"]`)
    if (!row) continue

    row.removeAttribute('data-pronoundb-target')
    const pronouns = pronounsMap[idsMap[pointer]]
    if (pronouns) {
      const tag = row.querySelector('.description-11DmNu')
      const element = document.createElement('div')
      element.className = tag.children[0].className
      element.style.marginLeft = '4px'
      element.innerText = ` • ${formatPronouns(pronouns)}`
      tag.appendChild(element)
    }
  }
}

// Bulk process stuff
const handleMessage = throttle(handleMessages)
const handleAutocompleteRow = throttle(handleAutocompleteRows)

function handleMutation (mutations) {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node.id?.startsWith('chat-messages-')) {
        handleMessage(node)
        continue
      }
      
      if (node.id?.startsWith?.('popout_') && node.querySelector('div[role="dialog"][class^="userPopout-"]')) {
        handleUserPopOut(node)
        continue
      }

      if (node.className?.startsWith?.('modal-') && node.querySelector('div[class^="userInfoSection-"')) {
        handleUserModal(node)
        continue
      }

      if (node.className?.startsWith?.('autocomplete-')) {
        handleAutocompleteRows(
          Array.from(
            node.querySelectorAll('[class^="autocompleteRow"]')).filter((node) => node.querySelector('[role="img"]')
          )
        )
      }

      if (node.className?.startsWith?.('autocompleteRow') && node.querySelector('[role="img"]')) {
        handleAutocompleteRow(node)
      }
    }
  }
}

export function run () {
  connect()

  // Process messages already loaded
  handleMessages(Array.from(document.querySelectorAll('[id^=chat-messages-]')))

  // Mutation observer
  const observer = new MutationObserver(handleMutation)
  observer.observe(document, { childList: true, subtree: true })

  const style = document.createElement('style')
  style.textContent = `
    .headerText-3Uvj1Y + .pronoundb-pronouns { margin-right: .6rem; }
    .userInfoSection-2acyCx.has-pronouns { display: grid; grid-template-columns: 3fr 1fr; grid-column-gap: 16px; }
    .userInfoSection-2acyCx.has-pronouns .userInfoSectionHeader-CBvMDh { grid-row: 1; }
  `
  document.head.appendChild(style)
}

export const match = /^https:\/\/(.+\.)?discord\.com\/(channels|activity|login|app|library|store)/
