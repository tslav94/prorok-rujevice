import { useState, useEffect } from 'react'
import { supabase } from './supabase'

function App() {
  const [igraci, setIgraci] = useState([])
  const [odabraniIgrac, setOdabraniIgrac] = useState('')
  const [prognoza, setPrognoza] = useState('')
  const [koristiDzoker, setKoristiDzoker] = useState(false)
  const [aktivnaUtakmica, setAktivnaUtakmica] = useState(null)
  const [svePrognoze, setSvePrognoze] = useState([])
  
  const [pokaziAdmin, setPokaziAdmin] = useState(false)
  const [sluzbeniBroj, setSluzbeniBroj] = useState('')

  const [aktivniTab, setAktivniTab] = useState('unos')
  const [poredak, setPoredak] = useState([])

  useEffect(() => {
    fetchIgraci()
    fetchZadnjaUtakmica()
    fetchPoredak()
  }, [])

  async function fetchIgraci() {
    const { data } = await supabase.from('igraci').select('*').order('id', { ascending: true })
    if (data) setIgraci(data)
  }

  async function fetchZadnjaUtakmica() {
    const { data } = await supabase.from('utakmice').select('*').order('id', { ascending: false }).limit(1).single()
    if (data) {
      setAktivnaUtakmica(data)
      fetchPrognoze(data.id)
    }
  }

  async function fetchPrognoze(utakmicaId) {
    const { data } = await supabase.from('prognoze').select('*, igraci(ime)').eq('utakmica_id', utakmicaId).order('vrijeme_unosa', { ascending: false })
    if (data) setSvePrognoze(data)
  }

  async function fetchPoredak() {
    const { data: sviIgraci } = await supabase.from('igraci').select('*')
    const { data: svePrognoze } = await supabase.from('prognoze').select('*')

    if (sviIgraci && svePrognoze) {
      let bodoviZbirno = sviIgraci.map(igrac => {
        let ukupno = 0
        let odigrano = 0
        svePrognoze.forEach(p => {
          if (p.igrac_id === igrac.id && p.bodovi !== null) {
            ukupno += p.bodovi
            odigrano++
          }
        })
        return { ...igrac, ukupno, odigrano }
      })
      
      bodoviZbirno.sort((a, b) => b.ukupno - a.ukupno)
      setPoredak(bodoviZbirno)
    }
  }

  const posaljiPrognozu = async () => {
    if (!odabraniIgrac) return alert("Alo, tko si ti? Odaberi proroka iz izbornika!")
    if (!prognoza || prognoza <= 0) return alert("Unesi neki normalan broj gledatelja!")
    if (!aktivnaUtakmica || aktivnaUtakmica.status !== 'otvorena') return alert("Utakmica je zaključana!")

    const vecUnio = svePrognoze.find(p => p.igrac_id === parseInt(odabraniIgrac))
    if (vecUnio) return alert("Već si unio prognozu za ovu utakmicu, nema varanja!")

    const { error } = await supabase.from('prognoze').insert([{
      igrac_id: odabraniIgrac,
      utakmica_id: aktivnaUtakmica.id,
      broj_gledatelja: parseInt(prognoza),
      joker: koristiDzoker
    }])

    if (error) alert("Greška: " + error.message)
    else {
      setPrognoza(''); setKoristiDzoker(false); setOdabraniIgrac('');
      fetchPrognoze(aktivnaUtakmica.id)
    }
  }

  const zavrsiUtakmicu = async () => {
    if (!sluzbeniBroj) return alert("Unesi službeni broj sa stadiona!")
    const tocanBroj = parseInt(sluzbeniBroj)

    // 1. Izračunaj tko je igrao, a tko nije
    const igraciKojiSuIgraliIds = svePrognoze.map(p => p.igrac_id)
    const igraciKojiNisuIgrali = igraci.filter(i => !igraciKojiSuIgraliIds.includes(i.id))

    // 2. Obrada onih koji su poslali prognozu
    let obrada = svePrognoze.map(p => ({ ...p, razlika: Math.abs(p.broj_gledatelja - tocanBroj) }))
    obrada.sort((a, b) => a.razlika - b.razlika)

    for (let i = 0; i < obrada.length; i++) {
      let p = obrada[i]
      let bodovi = 0

      if (i === 0) bodovi += 3
      else if (i === 1) bodovi += 1

      if (p.razlika <= 20) bodovi += 5
      else if (p.razlika <= 100) bodovi += 2

      if (i === obrada.length - 1 && p.razlika >= 800) bodovi -= 1
      if (p.joker) bodovi *= 2

      await supabase.from('prognoze').update({ bodovi: bodovi }).eq('id', p.id)
      
      if (p.joker) {
        const { data: igracData } = await supabase.from('igraci').select('preostali_dzokeri').eq('id', p.igrac_id).single()
        await supabase.from('igraci').update({ preostali_dzokeri: igracData.preostali_dzokeri - 1 }).eq('id', p.igrac_id)
      }
    }

    // 3. Kazna za one koji NISU igrali (-2 boda)
    for (let igrac of igraciKojiNisuIgrali) {
      await supabase.from('prognoze').insert([{
        igrac_id: igrac.id,
        utakmica_id: aktivnaUtakmica.id,
        broj_gledatelja: 0,
        bodovi: -2,
        napomena: 'Nije igrao',
        joker: false
      }])
    }

    // 4. Zaključaj utakmicu
    await supabase.from('utakmice').update({ status: 'zavrsena', sluzbeni_broj: tocanBroj }).eq('id', aktivnaUtakmica.id)

    alert("Bodovi izračunati! Kazne za neigranje (-2) su dodijeljene.")
    setPokaziAdmin(false)
    fetchZadnjaUtakmica() 
    fetchPoredak()
  }

  return (
    <div className="flex flex-col items-center p-6 pb-20">
      <header className="mb-6 text-center mt-6 w-full max-w-md">
        <h1 className="text-4xl font-extrabold text-sky-400 mb-2 drop-shadow-md">Prorok Rujevice ⚪️🔵</h1>
        
        <div className="flex bg-slate-800 rounded-xl p-1 mt-6 border border-slate-700">
          <button onClick={() => setAktivniTab('unos')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${aktivniTab === 'unos' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Aktivno Kolo</button>
          <button onClick={() => setAktivniTab('tablica')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${aktivniTab === 'tablica' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Tablica 🏆</button>
        </div>
      </header>

      {aktivniTab === 'unos' && (
        <div className="w-full flex flex-col items-center">
          {aktivnaUtakmica ? (
            <p className={`font-bold py-1 px-4 rounded-full inline-block mb-6 border ${aktivnaUtakmica.status === 'otvorena' ? 'text-white bg-sky-900/50 border-sky-700' : 'text-emerald-400 bg-emerald-900/50 border-emerald-700'}`}>
              ⚽ {aktivnaUtakmica.naziv} {aktivnaUtakmica.status === 'zavrsena' && '(ZAVRŠENO)'}
            </p>
          ) : <p className="text-red-400 mb-6">Učitavanje...</p>}

          {aktivnaUtakmica?.status === 'otvorena' && (
            <main className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700 mb-6">
              <h2 className="text-2xl font-bold mb-6 text-center border-b border-slate-700 pb-4">Unos Prognoze</h2>
              
              <div className="mb-6">
                <label className="block text-slate-400 text-sm mb-2 font-bold uppercase tracking-wider">Tko si ti?</label>
                <select className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-sky-500" value={odabraniIgrac} onChange={(e) => setOdabraniIgrac(e.target.value)}>
                  <option value="">-- Odaberi svog proroka --</option>
                  {igraci.map((igrac) => <option key={igrac.id} value={igrac.id}>{igrac.ime} (Džokera: {igrac.preostali_dzokeri})</option>)}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-slate-400 text-sm mb-2 font-bold uppercase tracking-wider">Broj gledatelja</label>
                <input type="number" className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-3xl text-center text-white focus:outline-none focus:border-sky-500" placeholder="npr. 6543" value={prognoza} onChange={(e) => setPrognoza(e.target.value)} />
              </div>

              <div className={`mb-8 flex items-center justify-between p-4 rounded-xl cursor-pointer border-2 transition-all ${koristiDzoker ? 'bg-sky-900/40 border-sky-500' : 'bg-slate-900 border-slate-700'}`} onClick={() => setKoristiDzoker(!koristiDzoker)}>
                <div>
                  <p className={`font-bold ${koristiDzoker ? 'text-sky-400' : 'text-white'}`}>Sami protiv svih (Džoker 🦈)</p>
                </div>
                <div className={`w-8 h-8 flex items-center justify-center border-2 rounded-md ${koristiDzoker ? 'bg-sky-500 border-sky-500' : 'border-slate-500'}`}>
                  {koristiDzoker && <span className="text-white font-black">✓</span>}
                </div>
              </div>

              <button onClick={posaljiPrognozu} className="w-full bg-sky-600 hover:bg-sky-500 text-white font-extrabold py-4 rounded-xl shadow-lg transition-transform active:scale-95 text-lg">ZAKLJUČAJ 🔒</button>
            </main>
          )}

          {svePrognoze.length > 0 && (
            <section className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700 mb-6">
              <h3 className="text-xl font-bold mb-4 text-center border-b border-slate-700 pb-2 text-sky-400">
                {aktivnaUtakmica?.status === 'zavrsena' ? `Službeni broj: ${aktivnaUtakmica.sluzbeni_broj}` : `Predane prognoze (${svePrognoze.length}/${igraci.length})`}
              </h3>
              <div className="space-y-3">
                {svePrognoze.sort((a,b) => aktivnaUtakmica?.status === 'zavrsena' ? Math.abs(a.broj_gledatelja - aktivnaUtakmica.sluzbeni_broj) - Math.abs(b.broj_gledatelja - aktivnaUtakmica.sluzbeni_broj) : 0).map((p) => (
                  <div key={p.id} className="bg-slate-900 p-4 rounded-xl flex justify-between items-center border border-slate-700">
                    <div className="font-bold text-lg text-slate-300">
                      {p.igraci?.ime} {p.joker && <span className="ml-1">🦈</span>}
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Prikaz brojke ILI teksta 'Nije igrao' */}
                      <div className={`text-xl font-black ${p.napomena === 'Nije igrao' ? 'text-slate-500 text-sm' : 'text-white'}`}>
                        {p.napomena === 'Nije igrao' ? 'Nije igrao' : p.broj_gledatelja}
                      </div>
                      
                      {aktivnaUtakmica?.status === 'zavrsena' && (
                        <div className={`font-black text-xl w-8 text-center ${p.bodovi > 0 ? 'text-emerald-400' : p.bodovi < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {p.bodovi > 0 ? `+${p.bodovi}` : p.bodovi}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {aktivnaUtakmica?.status === 'otvorena' && (
            <button onClick={() => setPokaziAdmin(!pokaziAdmin)} className="text-slate-600 text-xs mt-10 hover:text-slate-400">⚙️ Spiker</button>
          )}

          {pokaziAdmin && aktivnaUtakmica?.status === 'otvorena' && (
            <div className="w-full max-w-md bg-amber-900/30 p-6 rounded-2xl border border-amber-700/50 mt-4">
              <h3 className="text-amber-500 font-bold mb-4 text-center">SPITER TRIBINA</h3>
              <input type="number" className="w-full bg-slate-900 border border-amber-700/50 rounded-lg p-3 text-center text-white mb-4" placeholder="Službeni broj gledatelja..." value={sluzbeniBroj} onChange={(e) => setSluzbeniBroj(e.target.value)} />
              <button onClick={zavrsiUtakmicu} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl">PODIJELI BODOVE 🏆</button>
            </div>
          )}
        </div>
      )}

      {aktivniTab === 'tablica' && (
        <div className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl border border-amber-700/50">
          <h2 className="text-2xl font-bold mb-6 text-center text-amber-500 border-b border-slate-700 pb-4">Ukupni Poredak</h2>
          <div className="space-y-4">
            {poredak.map((igrac, index) => (
              <div key={igrac.id} className="bg-slate-900 p-4 rounded-xl flex justify-between items-center border border-slate-700 relative overflow-hidden">
                {index === 0 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>}
                {index === 1 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-300"></div>}
                {index === 2 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-700"></div>}
                
                <div className="flex items-center gap-4">
                  <div className={`font-black text-xl w-6 text-center ${index === 0 ? 'text-amber-500' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-amber-700' : 'text-slate-600'}`}>
                    {index + 1}.
                  </div>
                  <div>
                    <p className="font-bold text-lg text-white">{igrac.ime}</p>
                    <p className="text-xs text-slate-500">Odigrano: {igrac.odigrano} | Preostalo 🦈: {igrac.preostali_dzokeri}</p>
                  </div>
                </div>
                <div className={`text-3xl font-black ${igrac.ukupno < 0 ? 'text-red-500' : 'text-amber-400'}`}>
                  {igrac.ukupno}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App