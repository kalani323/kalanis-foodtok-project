'use client'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'

// all the filter options i want users to be able to pick from
const CUISINES = ['All','Italian','Japanese','Mexican','Chinese','Indian','Thai','American','Mediterranean','Korean','French','Other']
const PRICE_LEVELS = ['$','$$','$$$','$$$$']
const VIBES = ['All','Date Night','Casual','Group Friendly','Trendy','Hidden Gem','Brunch Spot','Late Night']

// blank form template — defaults to "Other" cuisine, "$$" price, and "Casual" vibe
const BLANK = { name:'', cuisine:'Other', price:'$$', location:'', vibe:'Casual', notes:'', website:'' }

// sample restaurants so the page doesn't look empty on first load before the database responds
const SAMPLE = [
  { id:1, name:'Carbone', cuisine:'Italian', price:'$$$', location:'New York, NY', vibe:'Date Night', notes:'Famous spicy rigatoni — reservations open exactly 30 days in advance', visited:false, thumb:null, website:null, rating:null },
  { id:2, name:'n/naka', cuisine:'Japanese', price:'$$$$', location:'Los Angeles, CA', vibe:'Date Night', notes:'Michelin-starred kaiseki — one of the hardest reservations in the country', visited:true, thumb:null, website:null, rating:null },
]

// helper functions to get the right color/background for each price level on the cards
const priceColor = p => ({ '$':'#2eaa72','$$':'#c49a0a','$$$':'#e87240','$$$$':'#ff8b94' }[p] || '#999')
const priceBg    = p => ({ '$':'#d4f5e9','$$':'#fef3c0','$$$':'#ffe8d6','$$$$':'#ffe4e6' }[p] || '#f5f5f5')

export default function App() {
  // main state — the list of all saved restaurants
  const [restaurants, setRestaurants] = useState(SAMPLE)

  // tracks whether initial data has loaded from the database yet
  // i need this so i don't accidentally fetch google places data for sample restaurants
  const [initialized, setInitialized] = useState(false)

  // modal visibility for the add/edit restaurant form
  const [showForm, setShowForm] = useState(false)

  // all the sidebar filter values — price uses min/max for the dual range slider
  const [filters, setFilters] = useState({ cuisine:'All', priceMin:1, priceMax:4, vibe:'All', visited:'All', rating:0, search:'' })

  // the form data for adding or editing a restaurant
  const [form, setForm] = useState(BLANK)

  // tracks the AI detection status: idle, loading, success, warn (low confidence), or error
  const [status, setStatus] = useState('idle')

  // holds the preview image URL when a user uploads a screenshot
  const [preview, setPreview] = useState(null)

  // tracks if user is dragging a file over the drop zone
  const [dragOver, setDragOver] = useState(false)

  // if this is set, we're editing an existing restaurant instead of creating a new one
  const [editId, setEditId] = useState(null)

  // help modal — starts open so first-time visitors see what the app does
  const [showHelp, setShowHelp] = useState(true)

  // ref for the hidden file input so i can trigger it programmatically
  const fileRef = useRef()

  // compresses images on the CLIENT side before uploading to the server
  // i had to do this because:
  // 1. phone screenshots are huge (5-8MB) and vercel has a 4.5MB request body limit
  // 2. i originally used sharp for server-side compression but it's a native module
  //    that doesn't work on vercel's serverless functions (different OS/architecture)
  // so now the browser resizes the image using canvas and converts to jpeg before upload
  const compressImage = (file) => new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      // cap the longest side at 1200px — more than enough for claude to read text
      const maxDim = 1200
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim }
        else { width = Math.round(width * maxDim / height); height = maxDim }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      // 0.85 quality jpeg keeps it small (~200-400KB) while staying readable
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    }
    img.src = url
  })

  // sends the compressed image to my /api/detect endpoint which forwards it to claude
  // claude haiku 4.5 analyzes the screenshot and extracts restaurant info
  // i switched from sonnet to haiku because sonnet took 15-20s and vercel hobby
  // has a 10s function timeout — haiku responds in 2-4s
  const analyze = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setPreview(URL.createObjectURL(file))
    setStatus('loading')
    setForm(BLANK)

    const compressed = await compressImage(file)
    const fd = new FormData()
    fd.append('image', compressed, 'image.jpg')

    try {
      const res = await fetch('/api/detect', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || data.error) { setStatus('error'); return }
      setForm({ name: data.name, cuisine: data.cuisine, price: data.price, location: data.location, vibe: data.vibe, notes: data.notes })
      // if claude isn't confident about its detection, i show a warning
      // so the user knows to double-check the auto-filled fields
      setStatus(data.confidence === 'low' ? 'warn' : 'success')
    } catch {
      setStatus('error')
    }
  }, [])

  // file input handler — resets value so you can upload the same file twice
  const handleFile = e => { const f = e.target.files?.[0]; if (f) analyze(f); e.target.value = '' }

  // drag and drop handler for the upload zone
  const handleDrop = e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) analyze(f) }

  // opens a fresh add form with blank fields
  const openForm = () => { setForm(BLANK); setStatus('idle'); setPreview(null); setEditId(null); setShowForm(true) }

  // opens the form pre-filled with an existing restaurant's data for editing
  const openEdit = (r) => { setForm({ name: r.name, cuisine: r.cuisine, price: r.price, location: r.location, vibe: r.vibe, notes: r.notes || '', website: r.website || '', rating: r.rating || '' }); setPreview(null); setStatus('idle'); setEditId(r.id); setShowForm(true) }

  // resets everything when closing the modal
  const closeForm = () => { setShowForm(false); setStatus('idle'); setPreview(null); setForm(BLANK); setEditId(null) }

  // saves to BOTH localStorage and the database at the same time
  // localStorage gives instant persistence (survives refresh, works offline)
  // upstash redis gives cross-device sync (same list on phone + laptop)
  // if the database call fails, it fails silently — localStorage still has the data
  const persist = (list) => {
    localStorage.setItem('kfr_restaurants', JSON.stringify(list))
    fetch('/api/restaurants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list)
    }).catch(() => {})
  }

  // saves a new restaurant or updates an existing one
  const save = () => {
    if (!form.name) return

    if (editId) {
      // editing — update the matching restaurant and persist
      setRestaurants(p => {
        const updated = p.map(r => r.id === editId ? { ...r, ...form } : r)
        persist(updated)
        return updated
      })
      closeForm()
    } else {
      // adding new — create with a timestamp ID, then kick off google places fetch
      const id = Date.now()
      const { name, location } = form
      setRestaurants(p => {
        const updated = [...p, { ...form, id, visited: false, thumb: null, website: '', rating: null }]
        persist(updated)
        return updated
      })
      closeForm()

      // after saving, hit google places API to get a photo, rating, and website
      // this runs in the background — the card shows up immediately and gets
      // enriched with google data once the API responds
      fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, location })
      }).then(r => r.json()).then(data => {
        setRestaurants(p => {
          const updated = p.map(r => r.id === id
            ? { ...r, thumb: data.photoName ? `/api/photo?name=${encodeURIComponent(data.photoName)}` : r.thumb, website: data.website ?? r.website, rating: data.rating ?? r.rating }
            : r
          )
          persist(updated)
          return updated
        })
      }).catch(() => {})
    }
  }

  // toggles a restaurant between visited and not visited
  const toggleVisited = id => {
    setRestaurants(p => {
      const updated = p.map(r => r.id === id ? { ...r, visited: !r.visited } : r)
      persist(updated)
      return updated
    })
  }

  // deletes a restaurant from the list
  const del = id => {
    setRestaurants(p => {
      const updated = p.filter(r => r.id !== id)
      persist(updated)
      return updated
    })
  }

  // on mount: load data from localStorage first (instant), then fetch from database
  // the database wins if it has data — this is how cross-device sync works
  // i initialize with SAMPLE data in useState (not localStorage) to avoid hydration errors
  // reading localStorage during SSR causes a mismatch because the server doesn't have it
  useEffect(() => {
    const local = (() => {
      try { const s = localStorage.getItem('kfr_restaurants'); return s ? JSON.parse(s) : null } catch { return null }
    })()
    if (local?.length) setRestaurants(local)

    // then try the database — if it has data, it overwrites localStorage
    fetch('/api/restaurants')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data) && data.length) { setRestaurants(data); localStorage.setItem('kfr_restaurants', JSON.stringify(data)) } })
      .catch(() => {})
      .finally(() => setInitialized(true))
  }, [])

  // after initial load, check for any restaurants missing photos and fetch from google places
  // this handles cases where a restaurant was saved but the places API didn't respond in time
  useEffect(() => {
    if (!initialized) return
    restaurants.filter(r => !r.thumb).forEach(r => {
      fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: r.name, location: r.location })
      }).then(res => res.json()).then(data => {
        setRestaurants(p => {
          const updated = p.map(rest => rest.id === r.id
            ? { ...rest, thumb: data.photoName ? `/api/photo?name=${encodeURIComponent(data.photoName)}` : rest.thumb, website: data.website ?? rest.website, rating: data.rating ?? rest.rating }
            : rest
          )
          persist(updated)
          return updated
        })
      }).catch(() => {})
    })
  }, [initialized])

  // applies all the sidebar filters, then sorts:
  // visited restaurants go to the bottom, everything else is alphabetical by name
  const filtered = useMemo(() => restaurants.filter(r => {
    if (filters.cuisine !== 'All' && r.cuisine !== filters.cuisine) return false
    // price filter uses the dual range slider — check if restaurant falls within min/max
    const pl = PRICE_LEVELS.indexOf(r.price) + 1
    if (pl < filters.priceMin || pl > filters.priceMax) return false
    if (filters.vibe !== 'All' && r.vibe !== filters.vibe) return false
    // "Wishlist" mode hides visited restaurants
    if (filters.visited === 'Wishlist' && r.visited) return false
    // rating slider — 0 means show all, otherwise filter by minimum rating
    if (filters.rating > 0 && (!r.rating || r.rating < filters.rating)) return false
    // search matches against name or location
    const q = filters.search.toLowerCase()
    if (q && !r.name.toLowerCase().includes(q) && !r.location.toLowerCase().includes(q)) return false
    return true
  }).sort((a, b) => {
    // push visited to the bottom so the wishlist stays front and center
    if (a.visited !== b.visited) return a.visited ? 1 : -1
    return a.name.localeCompare(b.name)
  }), [restaurants, filters])

  // passthrough helper — just makes the inline styles easier to read
  const s = (style) => style

  return (
    <div style={s({ minHeight:'100vh', background:'#fff', color:'#2d2d2d' })}>
      {/* sticky header with title and action buttons */}
      <div style={s({ background:'#fff', borderBottom:'1px solid #ebebeb', padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 })}>
        <div style={s({ fontFamily:"'Cute Notes', cursive", fontSize:32, color:'#2d2d2d' })}>
          kalani loves food
        </div>
        <div style={s({ display:'flex', gap:10 })}>
          <button onClick={openForm} style={s({ background:'#ff8b94', color:'#fff', border:'none', padding:'10px 22px', borderRadius:4, fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:500, cursor:'pointer' })}>
            + Add Restaurant
          </button>
          <button onClick={()=>setShowHelp(true)} style={s({ background:'transparent', border:'1px solid #ddd', color:'#888', padding:'10px 16px', borderRadius:4, fontFamily:"'DM Sans',sans-serif", fontSize:14, cursor:'pointer' })}>
            ?
          </button>
        </div>
      </div>

      {/* main layout: sidebar on the left, card grid on the right */}
      <div style={s({ display:'flex' })}>

        {/* sidebar — sticky so it stays visible while scrolling through cards */}
        <div style={s({ width:220, flexShrink:0, background:'#fafafa', borderRight:'1px solid #ebebeb', padding:'20px 16px', position:'sticky', top:67, height:'calc(100vh - 67px)', overflowY:'auto' })}>

          {/* stats overview — each stat gets its own colored box */}
          <div style={s({ marginBottom:24 })}>
            <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#999', textTransform:'uppercase', letterSpacing:1, marginBottom:10 })}>Stats</div>
            <div style={s({ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 })}>
              {[[restaurants.length,'Saved','#a8e6cf','#1a5940'],[restaurants.filter(r=>r.visited).length,'Visited','#dcedc1','#3a5a1a'],[restaurants.filter(r=>!r.visited).length,'Wishlist','#ffd3b6','#8a4a1a'],[[...new Set(restaurants.map(r=>r.cuisine))].length,'Cuisines','#ffaaa5','#8a2040']].map(([n,l,bg,tc])=>(
                <div key={l} style={s({ textAlign:'center', background:bg, border:`1px solid ${bg}`, borderRadius:6, padding:'10px 6px' })}>
                  <span style={s({ fontFamily:"'Playfair Display',serif", fontSize:22, color:tc, display:'block' })}>{n}</span>
                  <span style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:tc, textTransform:'uppercase', letterSpacing:1, opacity:.75 })}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* search bar — filters by restaurant name or location */}
          <div style={s({ marginBottom:16 })}>
            <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#999', textTransform:'uppercase', letterSpacing:1, marginBottom:6 })}>Search</div>
            <input className="inp" style={s({ width:'100%', boxSizing:'border-box' })} placeholder="Name or city…" value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))} />
          </div>

          {/* dropdown filters for cuisine and vibe */}
          {[['cuisine','Cuisine',CUISINES],['vibe','Vibe',VIBES]].map(([k,label,opts])=>(
            <div key={k} style={s({ marginBottom:12 })}>
              <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#999', textTransform:'uppercase', letterSpacing:1, marginBottom:6 })}>{label}</div>
              <select className="inp" style={s({ width:'100%', boxSizing:'border-box' })} value={filters[k]} onChange={e=>setFilters(f=>({...f,[k]:e.target.value}))}>
                {opts.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          ))}

          {/* toggle to hide visited restaurants — shows only the wishlist */}
          <div style={s({ marginBottom:12 })}>
            <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#999', textTransform:'uppercase', letterSpacing:1, marginBottom:6 })}>Hide Visited?</div>
            <button
              onClick={()=>setFilters(f=>({...f,visited:f.visited==='Wishlist'?'All':'Wishlist'}))}
              style={s({ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid', cursor:'pointer', fontSize:13, fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s', background: filters.visited==='Wishlist' ? '#ffd3b6' : 'white', borderColor: filters.visited==='Wishlist' ? '#ffb07a' : '#e0e0e0', color: filters.visited==='Wishlist' ? '#c45f00' : '#888' })}>
              {filters.visited==='Wishlist' ? '★ Wishlist only' : 'Show all'}
            </button>
          </div>

          {/* dual-handle price range slider
              i built this with two overlapping <input type="range"> elements
              the CSS in globals.css sets pointer-events:none on the track
              and pointer-events:all on the thumbs so you can grab either handle
              the green bar between them shows the selected range */}
          <div style={s({ marginBottom:12 })}>
            <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#999', textTransform:'uppercase', letterSpacing:1, marginBottom:10 })}>
              Price — {PRICE_LEVELS[filters.priceMin - 1]} to {PRICE_LEVELS[filters.priceMax - 1]}
            </div>
            <div style={s({ position:'relative', height:20, marginBottom:6 })}>
              {/* grey track background */}
              <div style={s({ position:'absolute', top:'50%', left:0, right:0, height:4, borderRadius:2, background:'#e0e0e0', transform:'translateY(-50%)' })} />
              {/* green fill between the two thumbs */}
              <div style={s({ position:'absolute', top:'50%', height:4, borderRadius:2, background:'#a8e6cf', transform:'translateY(-50%)', left:`${((filters.priceMin-1)/3)*100}%`, right:`${((4-filters.priceMax)/3)*100}%` })} />
              {/* min price thumb */}
              <input className="dual-range" type="range" min="1" max="4" step="1"
                value={filters.priceMin}
                onChange={e=>{const v=parseInt(e.target.value);setFilters(f=>({...f,priceMin:Math.min(v,f.priceMax)}))}}
              />
              {/* max price thumb */}
              <input className="dual-range" type="range" min="1" max="4" step="1"
                value={filters.priceMax}
                onChange={e=>{const v=parseInt(e.target.value);setFilters(f=>({...f,priceMax:Math.max(v,f.priceMin)}))}}
              />
            </div>
            <div style={s({ display:'flex', justifyContent:'space-between', fontSize:11, color:'#aaa', fontFamily:"'DM Sans',sans-serif" })}>
              <span>$</span><span>$$$$</span>
            </div>
          </div>

          {/* rating slider — filters by minimum google rating */}
          <div>
            <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#999', textTransform:'uppercase', letterSpacing:1, marginBottom:6 })}>
              Rating{filters.rating > 0 ? ` — ${filters.rating}+ ★` : ' — Any'}
            </div>
            <input type="range" min="0" max="5" step="0.5"
              value={filters.rating}
              onChange={e=>setFilters(f=>({...f,rating:parseFloat(e.target.value)}))}
              style={s({ width:'100%', accentColor:'#ffaaa5', cursor:'pointer' })}
            />
            <div style={s({ display:'flex', justifyContent:'space-between', fontSize:11, color:'#aaa', marginTop:2, fontFamily:"'DM Sans',sans-serif" })}>
              <span>Any</span><span>5 ★</span>
            </div>
          </div>

        </div>

        {/* restaurant card grid */}
        <div style={s({ flex:1, minWidth:0 })}>
          <div style={s({ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:18, padding:'24px 28px' })}>
            {filtered.length===0 ? (
              <div style={s({ textAlign:'center', padding:'80px 20px', color:'#bbb', gridColumn:'1/-1' })}>
                <div style={s({ fontSize:44, marginBottom:14 })}>🍽️</div>
                <div>No restaurants found</div>
              </div>
            ) : filtered.map(r=>(
              <div key={r.id} className="card" style={r.visited?{opacity:.6}:{}}>
                {/* card image — shows google places photo, or a placeholder if none */}
                <div style={s({ height:130, background:'linear-gradient(135deg,#ffd3b6,#ffaaa5)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', borderBottom:'1px solid #ebebeb' })}>
                  {r.thumb ? <img src={r.thumb} alt={r.name} style={s({ width:'100%', height:'100%', objectFit:'cover' })} /> : <span style={s({ fontSize:34, opacity:.4 })}>🍽️</span>}
                  {r.visited && <span style={s({ position:'absolute', top:10, left:10, background:'#a8e6cf', color:'#1a5940', fontSize:10, padding:'3px 9px', borderRadius:20, fontWeight:600 })}>✓ Visited</span>}
                </div>
                {/* card body — name, tags, location, notes, actions */}
                <div style={s({ padding:15 })}>
                  <div style={s({ fontFamily:"'Playfair Display',serif", fontSize:20, color:'#2d2d2d', marginBottom:8 })}>{r.name}</div>
                  {/* tag row — cuisine, price (color coded), vibe, and google rating */}
                  <div style={s({ display:'flex', gap:7, flexWrap:'wrap', marginBottom:9 })}>
                    <span className="tag" style={s({ background:'#a8e6cf', color:'#1a5940', border:'1px solid #a8e6cf' })}>{r.cuisine}</span>
                    <span className="tag" style={s({ fontWeight:600, background:priceBg(r.price), border:`1px solid ${priceBg(r.price)}`, color:priceColor(r.price) })}>{r.price}</span>
                    <span className="tag" style={s({ background:'#dcedc1', color:'#3a5a1a', border:'1px solid #dcedc1' })}>{r.vibe}</span>
                    {r.rating != null && <span className="tag" style={s({ background:'#ffd3b6', color:'#8a4a1a', border:'1px solid #ffd3b6' })}>★ {r.rating}</span>}
                  </div>
                  {r.location && <div style={s({ fontSize:13, color:'#888', marginBottom:7 })}>📍 {r.location}</div>}
                  {r.notes && <div style={s({ fontSize:13, color:'#777', fontStyle:'italic', lineHeight:1.5, marginBottom:11 })}>"{r.notes}"</div>}
                  {r.website && <a href={r.website} target="_blank" rel="noopener noreferrer" style={s({ display:'inline-block', fontSize:12, color:'#ff8b94', textDecoration:'none', marginBottom:11 })}>🌐 Visit Website →</a>}
                  {/* action buttons — mark visited, edit, delete */}
                  <div style={s({ display:'flex', gap:7, paddingTop:11, borderTop:'1px solid #ebebeb' })}>
                    {r.visited
                      ? <button className="btn" style={s({ color:'#888', borderColor:'#ddd', background:'transparent' })} onClick={()=>toggleVisited(r.id)}>Unmark</button>
                      : <button className="btn" style={s({ color:'#1a5940', borderColor:'#a8e6cf', background:'transparent' })} onClick={()=>toggleVisited(r.id)}>Mark Visited ✓</button>
                    }
                    <button className="btn" style={s({ color:'#555', borderColor:'#ddd', background:'transparent', marginLeft:'auto' })} onClick={()=>openEdit(r)}>Edit</button>
                    <button className="btn" style={s({ color:'#ff8b94', borderColor:'#ff8b94', background:'transparent' })} onClick={()=>del(r.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* add/edit restaurant modal */}
      {showForm && (
        <div onClick={e=>e.target===e.currentTarget&&closeForm()} style={s({ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 })}>
          <div style={s({ background:'#fff', border:'1px solid #ebebeb', borderRadius:10, padding:28, width:'100%', maxWidth:480, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.15)' })}>
            <div style={s({ fontFamily:"'Playfair Display',serif", fontSize:22, fontStyle:'italic', color:'#2d2d2d', marginBottom:4 })}>{editId ? 'Edit Restaurant' : 'Save a Restaurant'}</div>
            <div style={s({ fontSize:12, color:'#999', marginBottom:22 })}>{editId ? 'Update the details below.' : 'Screenshot a TikTok or Reel → upload it → Claude reads it ✨'}</div>

            {/* hidden file input — triggered by the drop zone or "change photo" button */}
            <input ref={fileRef} type="file" accept="image/*" style={s({ display:'none' })} onChange={handleFile} />

            {/* drop zone — only shows when there's no preview and we're not editing */}
            {!preview && !editId && (
              <div className={`dz${dragOver?' over':''}`}
                onDragOver={e=>{e.preventDefault();setDragOver(true)}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={handleDrop}
                onClick={()=>fileRef.current?.click()}
              >
                <div style={s({ fontSize:36, marginBottom:10 })}>📸</div>
                <div style={s({ fontSize:14, color:'#888', lineHeight:1.6 })}><strong style={s({ color:'#2d2d2d' })}>Tap to upload a screenshot</strong><br/>from TikTok or Instagram</div>
                <div style={s({ fontSize:12, color:'#bbb', marginTop:8 })}>On mobile: screenshot the video, then upload from camera roll</div>
              </div>
            )}

            {/* preview image with loading spinner while claude analyzes */}
            {preview && (
              <div style={s({ position:'relative', borderRadius:8, overflow:'hidden', border:'1px solid #ebebeb', marginBottom:16 })}>
                <img src={preview} alt="screenshot" style={s({ width:'100%', maxHeight:220, objectFit:'cover', display:'block' })} />
                {status==='loading' && (
                  <div style={s({ position:'absolute', inset:0, background:'rgba(0,0,0,.6)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 })}>
                    <div style={s({ width:28, height:28, border:'3px solid rgba(255,255,255,.2)', borderTopColor:'#ff8b94', borderRadius:'50%', animation:'spin .75s linear infinite' })} />
                    <div style={s({ fontSize:13, color:'rgba(255,255,255,.9)' })}>Reading screenshot…</div>
                  </div>
                )}
                {status!=='loading' && (
                  <button onClick={()=>{setPreview(null);setStatus('idle');setForm(BLANK);setTimeout(()=>fileRef.current?.click(),50)}}
                    style={s({ position:'absolute', top:9, right:9, background:'rgba(0,0,0,.6)', border:'none', color:'#fff', fontFamily:"'DM Sans',sans-serif", fontSize:11, padding:'4px 11px', borderRadius:20, cursor:'pointer' })}>
                    Change photo
                  </button>
                )}
              </div>
            )}

            {/* status banners — different colors for success, low confidence, and error */}
            {!editId && status==='success' && <div style={s({ padding:'10px 14px', borderRadius:6, background:'rgba(168,230,207,.25)', border:'1px solid #a8e6cf', color:'#1a5940', fontSize:13, marginBottom:16 })}>✓ Detected! Edit anything below if needed.</div>}
            {!editId && status==='warn'    && <div style={s({ padding:'10px 14px', borderRadius:6, background:'rgba(255,211,182,.35)', border:'1px solid #ffd3b6', color:'#8a4a1a', fontSize:13, marginBottom:16 })}>⚠ Possible match — please double-check.</div>}
            {!editId && status==='error'   && <div style={s({ padding:'10px 14px', borderRadius:6, background:'rgba(255,170,165,.25)', border:'1px solid #ffaaa5', color:'#8a2040', fontSize:13, marginBottom:16 })}>Couldn't read it — fill in below manually.</div>}

            {/* form fields — shown after upload completes or when editing */}
            {(editId || (preview && status!=='loading')) && (
              <>
                {!editId && <div style={s({ borderTop:'1px solid #ebebeb', margin:'16px 0' })} />}
                {!editId && <div style={s({ fontSize:11, color:'#ccc', textTransform:'uppercase', letterSpacing:1.5, marginBottom:14 })}>
                  {status==='success'||status==='warn' ? 'Auto-filled — edit if needed' : 'Fill in manually'}
                </div>}

                {/* text inputs for name and location */}
                {[
                  ['Restaurant Name *', 'name', 'text', 'e.g. TAO Downtown'],
                  ['Location', 'location', 'text', 'e.g. New York, NY'],
                ].map(([label, key, type, ph])=>(
                  <div key={key} style={s({ marginBottom:14 })}>
                    <label style={s({ display:'block', fontSize:11, color:'#999', textTransform:'uppercase', letterSpacing:1, marginBottom:5 })}>{label}</label>
                    <input className="fi" type={type} placeholder={ph} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} />
                  </div>
                ))}

                {/* select dropdowns for cuisine, price, and vibe */}
                <div style={s({ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 })}>
                  {[['Cuisine','cuisine',CUISINES.slice(1)],['Price','price',['$','$$','$$$','$$$$']],['Vibe','vibe',VIBES.slice(1)]].map(([label,key,opts])=>(
                    <div key={key} style={s({ gridColumn: key==='vibe' ? '1/-1' : 'auto' })}>
                      <label style={s({ display:'block', fontSize:11, color:'#999', textTransform:'uppercase', letterSpacing:1, marginBottom:5 })}>{label}</label>
                      <select className="fi" value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}>
                        {opts.map(o=><option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                {/* notes textarea */}
                <div style={s({ marginBottom:14 })}>
                  <label style={s({ display:'block', fontSize:11, color:'#999', textTransform:'uppercase', letterSpacing:1, marginBottom:5 })}>Notes</label>
                  <textarea className="ft" placeholder="Must-order dishes, reservation tips…" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
                </div>

                {/* cancel and save/update buttons */}
                <div style={s({ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' })}>
                  <button onClick={closeForm} style={s({ background:'transparent', border:'1px solid #ddd', color:'#888', padding:'9px 18px', borderRadius:4, fontFamily:"'DM Sans',sans-serif", fontSize:14, cursor:'pointer' })}>Cancel</button>
                  <button onClick={save} disabled={!form.name} style={s({ background: form.name ? '#ff8b94' : '#ffaaa5', border:'none', color:'#fff', padding:'9px 22px', borderRadius:4, fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:500, cursor: form.name ? 'pointer' : 'not-allowed' })}>
                    {editId ? 'Update Restaurant' : 'Save Restaurant'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* help modal — opens on first visit so people know what the app does */}
      {showHelp && (
        <div onClick={e=>e.target===e.currentTarget&&setShowHelp(false)} style={s({ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 })}>
          <div style={s({ background:'#fff', border:'1px solid #ebebeb', borderRadius:10, padding:28, width:'100%', maxWidth:460, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.15)' })}>
            <div style={s({ fontFamily:"'Cute Notes', cursive", fontSize:28, color:'#2d2d2d', marginBottom:4 })}>kalani loves food</div>
            <div style={s({ fontSize:13, color:'#999', marginBottom:18, fontFamily:"'DM Sans',sans-serif" })}>your personal restaurant bucket list</div>

            <div style={s({ fontSize:14, color:'#2d2d2d', fontFamily:"'DM Sans',sans-serif", lineHeight:1.8 })}>
              <div style={s({ fontWeight:600, marginBottom:6, color:'#ff8b94' })}>How it works</div>
              <div style={s({ marginBottom:14 })}>
                <strong>1.</strong> Screenshot a restaurant from TikTok or Instagram<br/>
                <strong>2.</strong> Upload it — AI reads the name, cuisine, price & vibe<br/>
                <strong>3.</strong> Edit details, add notes, and save it to your list
              </div>

              <div style={s({ fontWeight:600, marginBottom:6, color:'#ff8b94' })}>Features</div>
              <div style={s({ marginBottom:14 })}>
                <strong>Google Places:</strong> Automatically fetches ratings, photos & website links<br/>
                <strong>Filters & search:</strong> Filter by cuisine, price, vibe, rating — or just search<br/>
                <strong>Mark as visited:</strong> Check off restaurants you've been to<br/>
                <strong>Syncs everywhere:</strong> Your list saves across all your devices
              </div>

              <div style={s({ fontWeight:600, marginBottom:6, color:'#ff8b94' })}>Why you need this</div>
              <div>
                Stop losing restaurant recs in your camera roll. Every TikTok find, friend suggestion, and "we have to go there" moment — saved in one place, ready for when you're hungry.
              </div>
            </div>

            <div style={s({ marginTop:20, textAlign:'right' })}>
              <button onClick={()=>setShowHelp(false)} style={s({ background:'#ff8b94', color:'#fff', border:'none', padding:'9px 22px', borderRadius:4, fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:500, cursor:'pointer' })}>
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
