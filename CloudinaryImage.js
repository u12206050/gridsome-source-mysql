// @vue/component
export default {
  name: 'g-image',
  functional: true,
  props: {
    src: { type: [Object, String], required: true },
    width: { type: String, default: '' },
    height: { type: String, default: '' },
    quality: { type: String, default: '' },
    fit: { type: String, default: '' },
    position: { type: String, default: '' },
    background: { type: String, default: '' },
    blur: { type: String, default: '' },
    immediate: { type: true, default: undefined }
  },

  render: (h, { data, props }) => {
    const classNames = [data.class, 'g-image']
    const noscriptClassNames = [data.staticClass, classNames.slice()]
    const isImmediate = props.immediate || props.immediate !== undefined
    const directives = data.directives || []
    const attrs = data.attrs || {}
    const hook = data.hook || {}
    const res = []

    if (props.src === null) {
      console.error('Image src prop can not be null')
      return null
    }

    switch (typeof props.src) {
      case 'string':
        attrs.src = props.src
        break

      case 'object': {
        const { src, srcset, sizes, size, dataUri } = props.src
        const isLazy = !isImmediate && dataUri

        attrs.src = isLazy ? dataUri : src
        attrs.width = size.width

        if (isLazy) attrs['data-src'] = src
        if (srcset.length) {
          const { width } = props
          if (width) {
            let newSrc = null
            if (width <= 100 && src.indexOf('image/upload/') > 0) {
              newSrc = src.replace(/image\/upload\/[^\/]+\//, 'image/upload/c_scale,w_100,h_100/')
              attrs[`${isLazy ? 'data-' : ''}srcset`] = `${newSrc} 100w`
              attrs['data-src'] = newSrc
            } else {
              let newSrcSet = []

              srcset.forEach(s => {
                let parts = s.split(' ')
                let set = {
                  w: parts[1].replace('w',''),
                  src: parts[0]
                }
                if (set.w >= width && (!newSrc || set.w <= newSrc.w)) newSrc = set
                if (set.w < width) newSrcSet.push(`${set.src} ${set.w}w`)
              })

              if (newSrc) newSrcSet.push(`${newSrc.src} ${newSrc.w}w`)
              else newSrc = newSrcSet[newSrcSet.length - 1]

              attrs[`${isLazy ? 'data-' : ''}srcset`] = newSrcSet.join(', ')
              attrs['data-src'] = newSrc.src
            }
          } else {
            attrs[`${isLazy ? 'data-' : ''}srcset`] = srcset.join(', ')
          }
        }
        if (sizes) attrs[`${isLazy ? 'data-' : ''}sizes`] = sizes

        if (isLazy) {
          directives.push({ name: 'g-image' })
        }

        break
      }
    }

    hook.update = (oldVnode, vnode) => {
      const { attrs: oldAttrs = {}} = oldVnode.data
      const { attrs = {}} = vnode.data

      if (attrs['data-src'] && attrs.src !== oldAttrs.src) {
        // clear srcset and sizes to show the dataUri image
        vnode.elm.srcset = ''
        vnode.elm.sizes = ''
      }
    }

    res.push(h('img', {
      ...data,
      class: classNames,
      directives,
      props,
      attrs,
      hook
    }))

    if (attrs['data-src']) {
      classNames.push('g-image--lazy')
      classNames.push('g-image--loading')
      noscriptClassNames.push('g-image--loaded')

      // must render as innerHTML to make hydration work

      res.push(h('noscript', {
        domProps: {
          innerHTML: `` +
            `<img src="${props.src.src}" class="${noscriptClassNames.join(' ')}"` +
            (attrs.width ? ` width="${attrs.width}"`: '') +
            (attrs.alt ? ` alt="${attrs.alt}"` : '') +
            `>`
        }
      }))
    }

    return res
  }
}