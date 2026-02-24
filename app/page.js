'use client'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'

const CUISINES = ['All','Italian','Japanese','Mexican','Chinese','Indian','Thai','American','Mediterranean','Korean','French','Other']
const PRICES = ['All','$','$$','$$$','$$$$']
const VIBES = ['All','Date Night','Casual','Group Friendly','Trendy','Hidden Gem','Brunch Spot','Late Night']
const BLANK = { name:'', cuisine:'Other', price:'$$', location:'', vibe:'Casual', notes:'', website:'' }

const SAMPLE = [
  { id:1, name:'Carbone', cuisine:'Italian', price:'$$$', location:'New York, NY', vibe:'Date Night', notes:'Famous spicy rigatoni — reservations open exactly 30 days in advance', visited:false, thumb:null, website:null, rating:null },
  { id:2, name:'n/naka', cuisine:'Japanese', price:'$$$$', location:'Los Angeles, CA', vibe:'Date Night', notes:'Michelin-starred kaiseki — one of the hardest reservations in the country', visited:true, thumb:null, website:null, rating:null },
]

const priceColor = p => ({ '$':'#4ade80','$$':'#facc15','$$$':'#f97316','$$$$':'#f43f5e' }[p] || '#ccc')

export default function App() {
  const [restaurants, setRestaurants] = useState(SAMPLE)
  const [initialized, setInitialized] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [filters, setFilters] = useState({ cuisine:'All', price:'All', vibe:'All', visited:'All', rating:'All', search:'' })
  const [form, setForm] = useState(BLANK)
  const [status, setStatus] = useState('idle') // idle | loading | success | warn | error
  const [preview, setPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [editId, setEditId] = useState(null)
  const fileRef = useRef()

  const analyze = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setPreview(URL.createObjectURL(file))
    setStatus('loading')
    setForm(BLANK)

    const fd = new FormData()
    fd.append('image', file)

    try {
      const res = await fetch('/api/detect', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || data.error) { setStatus('error'); return }
      setForm({ name: data.name, cuisine: data.cuisine, price: data.price, location: data.location, vibe: data.vibe, notes: data.notes })
      setStatus(data.confidence === 'low' ? 'warn' : 'success')
    } catch {
      setStatus('error')
    }
  }, [])

  const handleFile = e => { const f = e.target.files?.[0]; if (f) analyze(f); e.target.value = '' }
  const handleDrop = e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) analyze(f) }

  const openForm = () => { setForm(BLANK); setStatus('idle'); setPreview(null); setEditId(null); setShowForm(true) }

  const openEdit = (r) => { setForm({ name: r.name, cuisine: r.cuisine, price: r.price, location: r.location, vibe: r.vibe, notes: r.notes || '', website: r.website || '', rating: r.rating || '' }); setPreview(null); setStatus('idle'); setEditId(r.id); setShowForm(true) }

  const closeForm = () => { setShowForm(false); setStatus('idle'); setPreview(null); setForm(BLANK); setEditId(null) }

  const save = () => {
    if (!form.name) return
    if (editId) {
      setRestaurants(p => p.map(r => r.id === editId ? { ...r, ...form } : r))
      closeForm()
    } else {
      const id = Date.now()
      const { name, location } = form
      setRestaurants(p => [...p, { ...form, id, visited: false, thumb: null, website: '' }])
      closeForm()

      fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, location })
      }).then(r => r.json()).then(data => {
        setRestaurants(p => p.map(r => r.id === id
          ? { ...r, thumb: data.photoName ? `/api/photo?name=${encodeURIComponent(data.photoName)}` : r.thumb, website: data.website ?? r.website, rating: data.rating ?? r.rating }
          : r
        ))
      }).catch(() => {})
    }
  }

  const toggleVisited = id => setRestaurants(p => p.map(r => r.id === id ? { ...r, visited: !r.visited } : r))
  const del = id => setRestaurants(p => p.filter(r => r.id !== id))

  // Load from localStorage after mount (avoids SSR/client hydration mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kfr_restaurants')
      if (saved) setRestaurants(JSON.parse(saved).map(r => ({ rating: null, ...r })))
    } catch {}
    setInitialized(true)
  }, [])

  // Save to localStorage only after initial load
  useEffect(() => {
    if (!initialized) return
    localStorage.setItem('kfr_restaurants', JSON.stringify(restaurants))
  }, [restaurants, initialized])

  // Fetch photos/data for restaurants missing a thumb, only after load
  useEffect(() => {
    if (!initialized) return
    restaurants.filter(r => !r.thumb).forEach(r => {
      fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: r.name, location: r.location })
      }).then(res => res.json()).then(data => {
        setRestaurants(p => p.map(rest => rest.id === r.id
          ? { ...rest, thumb: data.photoName ? `/api/photo?name=${encodeURIComponent(data.photoName)}` : rest.thumb, website: data.website ?? rest.website, rating: data.rating ?? rest.rating }
          : rest
        ))
      }).catch(() => {})
    })
  }, [initialized])

  const filtered = useMemo(() => restaurants.filter(r => {
    if (filters.cuisine !== 'All' && r.cuisine !== filters.cuisine) return false
    if (filters.price !== 'All' && r.price !== filters.price) return false
    if (filters.vibe !== 'All' && r.vibe !== filters.vibe) return false
    if (filters.visited === 'Visited' && !r.visited) return false
    if (filters.visited === 'Wishlist' && r.visited) return false
    if (filters.rating !== 'All') {
      const min = filters.rating.startsWith('5') ? 4.5 : parseFloat(filters.rating)
      if (!r.rating || r.rating < min) return false
    }
    const q = filters.search.toLowerCase()
    if (q && !r.name.toLowerCase().includes(q) && !r.location.toLowerCase().includes(q)) return false
    return true
  }), [restaurants, filters])

  const s = (style) => style // passthrough for readability

  return (
    <div style={s({ minHeight:'100vh', background:'#0f0e0c', color:'#f5f0e8' })}>
      {/* Header */}
      <div style={s({ background:'#0f0e0c', borderBottom:'1px solid #2a2520', padding:'18px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 })}>
        <div style={s({ fontFamily:"'Playfair Display',serif", fontSize:26, fontStyle:'italic', color:'#e8d5b0' })}>
          Kalani's Favorite Restaurants
        </div>
        <button onClick={openForm} style={s({ background:'#d4622a', color:'#fff', border:'none', padding:'10px 22px', borderRadius:4, fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:500, cursor:'pointer' })}>
          + Add Restaurant
        </button>
      </div>

      {/* Body */}
      <div style={s({ display:'flex' })}>

        {/* Sidebar */}
        <div style={s({ width:220, flexShrink:0, background:'#13110d', borderRight:'1px solid #2a2520', padding:'20px 16px', position:'sticky', top:67, height:'calc(100vh - 67px)', overflowY:'auto' })}>

          {/* Stats */}
          <div style={s({ marginBottom:24 })}>
            <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#7a6e5f', textTransform:'uppercase', letterSpacing:1, marginBottom:10 })}>Stats</div>
            <div style={s({ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 })}>
              {[[restaurants.length,'Saved'],[restaurants.filter(r=>r.visited).length,'Visited'],[restaurants.filter(r=>!r.visited).length,'Wishlist'],[[...new Set(restaurants.map(r=>r.cuisine))].length,'Cuisines']].map(([n,l])=>(
                <div key={l} style={s({ textAlign:'center', background:'#1a1813', border:'1px solid #2a2520', borderRadius:6, padding:'10px 6px' })}>
                  <span style={s({ fontFamily:"'Playfair Display',serif", fontSize:22, color:'#e8d5b0', display:'block' })}>{n}</span>
                  <span style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:'#7a6e5f', textTransform:'uppercase', letterSpacing:1 })}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Search */}
          <div style={s({ marginBottom:16 })}>
            <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#7a6e5f', textTransform:'uppercase', letterSpacing:1, marginBottom:6 })}>Search</div>
            <input className="inp" style={s({ width:'100%', boxSizing:'border-box' })} placeholder="Name or city…" value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))} />
          </div>

          {/* Filter dropdowns */}
          {[['cuisine','Cuisine',CUISINES],['price','Price',PRICES],['vibe','Vibe',VIBES]].map(([k,label,opts])=>(
            <div key={k} style={s({ marginBottom:12 })}>
              <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#7a6e5f', textTransform:'uppercase', letterSpacing:1, marginBottom:6 })}>{label}</div>
              <select className="inp" style={s({ width:'100%', boxSizing:'border-box' })} value={filters[k]} onChange={e=>setFilters(f=>({...f,[k]:e.target.value}))}>
                {opts.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          ))}

          {/* Status */}
          <div style={s({ marginBottom:12 })}>
            <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#7a6e5f', textTransform:'uppercase', letterSpacing:1, marginBottom:6 })}>Status</div>
            <select className="inp" style={s({ width:'100%', boxSizing:'border-box' })} value={filters.visited} onChange={e=>setFilters(f=>({...f,visited:e.target.value}))}>
              {['All','Wishlist','Visited'].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>

          {/* Rating */}
          <div>
            <div style={s({ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:'#7a6e5f', textTransform:'uppercase', letterSpacing:1, marginBottom:6 })}>Rating</div>
            <select className="inp" style={s({ width:'100%', boxSizing:'border-box' })} value={filters.rating} onChange={e=>setFilters(f=>({...f,rating:e.target.value}))}>
              {['All','5 ★','4+ ★','3+ ★'].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>

        </div>

        {/* Grid */}
        <div style={s({ flex:1, minWidth:0 })}>
          <div style={s({ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:18, padding:'24px 28px' })}>
            {filtered.length===0 ? (
              <div style={s({ textAlign:'center', padding:'80px 20px', color:'#4a4236', gridColumn:'1/-1' })}>
                <div style={s({ fontSize:44, marginBottom:14 })}>🍽️</div>
                <div>No restaurants found</div>
              </div>
            ) : filtered.map(r=>(
              <div key={r.id} className="card" style={r.visited?{opacity:.6}:{}}>
                <div style={s({ height:130, background:'linear-gradient(135deg,#1f1a14,#2a2016)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', borderBottom:'1px solid #2a2520' })}>
                  {r.thumb ? <img src={r.thumb} alt={r.name} style={s({ width:'100%', height:'100%', objectFit:'cover', opacity:.7 })} /> : <span style={s({ fontSize:34, opacity:.35 })}>🍽️</span>}
                  {r.visited && <span style={s({ position:'absolute', top:10, left:10, background:'#4ade80', color:'#0f0e0c', fontSize:10, padding:'3px 9px', borderRadius:20, fontWeight:600 })}>✓ Visited</span>}
                </div>
                <div style={s({ padding:15 })}>
                  <div style={s({ fontFamily:"'Playfair Display',serif", fontSize:20, color:'#e8d5b0', marginBottom:8 })}>{r.name}</div>
                  <div style={s({ display:'flex', gap:7, flexWrap:'wrap', marginBottom:9 })}>
                    <span className="tag" style={s({ background:'#2a2016', color:'#c4a882', border:'1px solid #3a3228' })}>{r.cuisine}</span>
                    <span className="tag" style={s({ fontWeight:600, background:'transparent', border:`1px solid ${priceColor(r.price)}55`, color:priceColor(r.price) })}>{r.price}</span>
                    <span className="tag" style={s({ background:'#1a1f2a', color:'#82a8c4', border:'1px solid #283040' })}>{r.vibe}</span>
                    {r.rating != null && <span className="tag" style={s({ background:'#2a1f0a', color:'#f59e0b', border:'1px solid #5a4020' })}>★ {r.rating}</span>}
                  </div>
                  {r.location && <div style={s({ fontSize:13, color:'#7a6e5f', marginBottom:7 })}>📍 {r.location}</div>}
                  {r.notes && <div style={s({ fontSize:13, color:'#a09282', fontStyle:'italic', lineHeight:1.5, marginBottom:11 })}>"{r.notes}"</div>}
                  {r.website && <a href={r.website} target="_blank" rel="noopener noreferrer" style={s({ display:'inline-block', fontSize:12, color:'#d4622a', textDecoration:'none', marginBottom:11 })}>🌐 Visit Website →</a>}
                  <div style={s({ display:'flex', gap:7, paddingTop:11, borderTop:'1px solid #2a2520' })}>
                    {r.visited
                      ? <button className="btn" style={s({ color:'#7a6e5f', borderColor:'#3a3228', background:'transparent' })} onClick={()=>toggleVisited(r.id)}>Unmark</button>
                      : <button className="btn" style={s({ color:'#4ade80', borderColor:'#4ade80', background:'transparent' })} onClick={()=>toggleVisited(r.id)}>Mark Visited ✓</button>
                    }
                    <button className="btn" style={s({ color:'#c4a882', borderColor:'#3a3228', background:'transparent', marginLeft:'auto' })} onClick={()=>openEdit(r)}>Edit</button>
                    <button className="btn" style={s({ color:'#f43f5e', borderColor:'#f43f5e', background:'transparent' })} onClick={()=>del(r.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Modal */}
      {showForm && (
        <div onClick={e=>e.target===e.currentTarget&&closeForm()} style={s({ position:'fixed', inset:0, background:'rgba(0,0,0,.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 })}>
          <div style={s({ background:'#1a1813', border:'1px solid #2a2520', borderRadius:10, padding:28, width:'100%', maxWidth:480, maxHeight:'92vh', overflowY:'auto' })}>
            <div style={s({ fontFamily:"'Playfair Display',serif", fontSize:22, fontStyle:'italic', color:'#e8d5b0', marginBottom:4 })}>{editId ? 'Edit Restaurant' : 'Save a Restaurant'}</div>
            <div style={s({ fontSize:12, color:'#5a4e3a', marginBottom:22 })}>{editId ? 'Update the details below.' : 'Screenshot a TikTok or Reel → upload it → Claude reads it ✨'}</div>

            <input ref={fileRef} type="file" accept="image/*" style={s({ display:'none' })} onChange={handleFile} />

            {!preview && !editId && (
              <div className={`dz${dragOver?' over':''}`}
                onDragOver={e=>{e.preventDefault();setDragOver(true)}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={handleDrop}
                onClick={()=>fileRef.current?.click()}
              >
                <div style={s({ fontSize:36, marginBottom:10 })}>📸</div>
                <div style={s({ fontSize:14, color:'#a09282', lineHeight:1.6 })}><strong style={s({ color:'#e8d5b0' })}>Tap to upload a screenshot</strong><br/>from TikTok or Instagram</div>
                <div style={s({ fontSize:12, color:'#4a4236', marginTop:8 })}>On mobile: screenshot the video, then upload from camera roll</div>
              </div>
            )}

            {preview && (
              <div style={s({ position:'relative', borderRadius:8, overflow:'hidden', border:'1px solid #2a2520', marginBottom:16 })}>
                <img src={preview} alt="screenshot" style={s({ width:'100%', maxHeight:220, objectFit:'cover', display:'block' })} />
                {status==='loading' && (
                  <div style={s({ position:'absolute', inset:0, background:'rgba(0,0,0,.65)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 })}>
                    <div style={s({ width:28, height:28, border:'3px solid rgba(255,255,255,.15)', borderTopColor:'#d4622a', borderRadius:'50%', animation:'spin .75s linear infinite' })} />
                    <div style={s({ fontSize:13, color:'rgba(255,255,255,.7)' })}>Reading screenshot…</div>
                  </div>
                )}
                {status!=='loading' && (
                  <button onClick={()=>{setPreview(null);setStatus('idle');setForm(BLANK);setTimeout(()=>fileRef.current?.click(),50)}}
                    style={s({ position:'absolute', top:9, right:9, background:'rgba(0,0,0,.75)', border:'1px solid #3a3228', color:'#c4a882', fontFamily:"'DM Sans',sans-serif", fontSize:11, padding:'4px 11px', borderRadius:20, cursor:'pointer' })}>
                    Change photo
                  </button>
                )}
              </div>
            )}

            {!editId && status==='success' && <div style={s({ padding:'10px 14px', borderRadius:6, background:'rgba(74,222,128,.07)', border:'1px solid rgba(74,222,128,.2)', color:'#4ade80', fontSize:13, marginBottom:16 })}>✓ Detected! Edit anything below if needed.</div>}
            {!editId && status==='warn'    && <div style={s({ padding:'10px 14px', borderRadius:6, background:'rgba(250,204,21,.07)', border:'1px solid rgba(250,204,21,.2)', color:'#facc15', fontSize:13, marginBottom:16 })}>⚠ Possible match — please double-check.</div>}
            {!editId && status==='error'   && <div style={s({ padding:'10px 14px', borderRadius:6, background:'rgba(244,63,94,.07)', border:'1px solid rgba(244,63,94,.2)', color:'#f87191', fontSize:13, marginBottom:16 })}>Couldn't read it — fill in below manually.</div>}

            {(editId || (preview && status!=='loading')) && (
              <>
                {!editId && <div style={s({ borderTop:'1px solid #2a2520', margin:'16px 0' })} />}
                {!editId && <div style={s({ fontSize:11, color:'#3a3228', textTransform:'uppercase', letterSpacing:1.5, marginBottom:14 })}>
                  {status==='success'||status==='warn' ? 'Auto-filled — edit if needed' : 'Fill in manually'}
                </div>}

                {[
                  ['Restaurant Name *', 'name', 'text', 'e.g. TAO Downtown'],
                  ['Location', 'location', 'text', 'e.g. New York, NY'],
                ].map(([label, key, type, ph])=>(
                  <div key={key} style={s({ marginBottom:14 })}>
                    <label style={s({ display:'block', fontSize:11, color:'#7a6e5f', textTransform:'uppercase', letterSpacing:1, marginBottom:5 })}>{label}</label>
                    <input className="fi" type={type} placeholder={ph} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} />
                  </div>
                ))}

                <div style={s({ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 })}>
                  {[['Cuisine','cuisine',CUISINES.slice(1)],['Price','price',['$','$$','$$$','$$$$']],['Vibe','vibe',VIBES.slice(1)]].map(([label,key,opts])=>(
                    <div key={key} style={s({ gridColumn: key==='vibe' ? '1/-1' : 'auto' })}>
                      <label style={s({ display:'block', fontSize:11, color:'#7a6e5f', textTransform:'uppercase', letterSpacing:1, marginBottom:5 })}>{label}</label>
                      <select className="fi" value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}>
                        {opts.map(o=><option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <div style={s({ marginBottom:14 })}>
                  <label style={s({ display:'block', fontSize:11, color:'#7a6e5f', textTransform:'uppercase', letterSpacing:1, marginBottom:5 })}>Notes</label>
                  <textarea className="ft" placeholder="Must-order dishes, reservation tips…" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
                </div>

                <div style={s({ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' })}>
                  <button onClick={closeForm} style={s({ background:'transparent', border:'1px solid #2a2520', color:'#7a6e5f', padding:'9px 18px', borderRadius:4, fontFamily:"'DM Sans',sans-serif", fontSize:14, cursor:'pointer' })}>Cancel</button>
                  <button onClick={save} disabled={!form.name} style={s({ background: form.name ? '#d4622a' : '#5a3020', border:'none', color:'#fff', padding:'9px 22px', borderRadius:4, fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:500, cursor: form.name ? 'pointer' : 'not-allowed' })}>
                    {editId ? 'Update Restaurant' : 'Save Restaurant'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
