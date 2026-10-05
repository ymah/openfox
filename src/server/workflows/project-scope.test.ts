import { describe, expect, it } from 'vitest'
import { workflowFitsProject } from './project-scope.js'

describe('workflowFitsProject', () => {
  it('runs a categorised workflow only in a project of that function', () => {
    expect(workflowFitsProject({ id: 'gtd-capture', category: 'gtd' }, 'gtd', true)).toBe(true)
    expect(workflowFitsProject({ id: 'gtd-capture', category: 'gtd' }, 'dev', true)).toBe(false)
    expect(workflowFitsProject({ id: 'chat-decide', category: 'chat' }, 'dev', true)).toBe(false)
    expect(workflowFitsProject({ id: 'writing-new-book', category: 'writing' }, 'chat', true)).toBe(false)
  })

  it('treats the built-in default workflow as the dev build loop', () => {
    expect(workflowFitsProject({ id: 'default' }, 'dev', true)).toBe(true)
    expect(workflowFitsProject({ id: 'default' }, 'gtd', true)).toBe(false)
    expect(workflowFitsProject({ id: 'default' }, 'chat', true)).toBe(false)
  })

  it('lets uncategorised custom workflows run anywhere, even one named default', () => {
    expect(workflowFitsProject({ id: 'my-flow' }, 'gtd', false)).toBe(true)
    expect(workflowFitsProject({ id: 'default' }, 'gtd', false)).toBe(true)
  })
})
