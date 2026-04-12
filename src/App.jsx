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

  // 3 Taba sada: 'unos', 'povijest', 'tablica'
  const [aktivniTab, setAktivniTab] = useState('unos')
  const [poredak, setPoredak] = useState([])
  const [pokaziPravila, setPokaziPravila] = useState(false)

  // NOVO: Stanja za povijest
  const [zavrseneUtakmice, setZavrseneUtakmice] = useState([])
  const [odabranaPovijestId, setOdabranaPovijestId] = useState('')
  const [povijestPrognoze, setPovijestPrognoze] = useState([])

  useEffect(() => {
    fetchIgraci()
    fetchTrenutnaUtakmica()
    fetchPoredak()
    fetchZavrseneUtakmice()
  }, [])

  // Prati promjenu padajućeg izbornika u Povijesti
  useEffect(() => {
    if (odabranaPovijestId) {
      fetchPovijestPrognoze(odabranaPovijestId)
    } else {
      setPovijestPrognoze([])
    }
  }, [odabranaPovijestId])

  async function fetchIgraci() {
    const { data } = await supabase.from('igraci').select('*').order('id', { ascending: true })
    if (data) setIgraci(data)
  }

  async function fetchTrenutnaUtakmica() {
    const { data: otvorena } = await supabase.from('utakmice').select('*').eq('status', 'otvorena').single()
    if (otvorena) {
      setAktivnaUtakmica(otvorena)
      fetchPrognoze(otvorena.id)
    } else {
      const { data: zavrsena } = await supabase.from('utakmice').select('*').eq('status', 'zavrsena').order('id', { ascending: false }).limit(1).single()
      if (zavrsena) {
        setAktivnaUtakmica(zavrsena)
        fetchPrognoze(zavrsena.id)
      }
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

  // NOVO: Dohvaćanje svih završenih utakmica za arhivu
  async function fetchZavrseneUtakmice() {
    const { data } = await supabase.from('utakmice').select('*').eq('status', 'zavrsena').order('id', { ascending: false })
    if (data) setZavrseneUtakmice(data)
  }

  // NOVO: Dohvaćanje prognoza za odabranu utakmicu u arhivu
  async function fetchPovijestPrognoze(utakmicaId) {
    const { data } = await supabase.from('prognoze').select('*, igraci(ime)').eq('utakmica_id', utakmicaId)
    if (data) {
      // Sortiraj po bodovima (od najvećeg prema najmanjem)
      let sortirano = [...data].sort((a, b) => b.bodovi - a.bodovi)
      setPovijestPrognoze(sortirano)
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

    const igraciKojiSuIgraliIds = svePrognoze.map(p => p.igrac_id)
    const igraciKojiNisuIgrali = igraci.filter(i => !igraciKojiSuIgraliIds.includes(i.id))

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

    await supabase.from('utakmice').update({ status: 'zavrsena', sluzbeni_broj: tocanBroj }).eq('id', aktivnaUtakmica.id)

    alert("Bodovi izračunati! Kazne za neigranje (-2) su dodijeljene.")
    setPokaziAdmin(false)
    fetchTrenutnaUtakmica() 
    fetchPoredak()
    fetchZavrseneUtakmice() // Osvježi listu za povijest
  }

  return (
    <div className="flex flex-col items-center p-6 pb-20 relative min-h-screen">
      
      <button 
        onClick={() => setPokaziPravila(true)}
        className="absolute top-6 right-6 bg-slate-800 border border-slate-600 text-slate-300 px-3 py-1 rounded-full text-sm font-bold shadow-lg hover:bg-slate-700 hover:text-white transition-all z-10"
      >
        Pravila 📜
      </button>

      {pokaziPravila && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPokaziPravila(false)}>
          <div className="bg-slate-800 border border-sky-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
              <h3 className="text-xl font-bold text-sky-400">Pravila Igre ⚪️🔵</h3>
              <button onClick={() => setPokaziPravila(false)} className="text-slate-400 hover:text-white text-xl font-black">&times;</button>
            </div>
            <div className="text-sm text-slate-300 space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              <p><strong className="text-white">Cilj:</strong> Pogoditi točan broj gledatelja na Rujevici.</p>
              
              <p className="text-sky-300 font-bold mt-2 pt-2 border-t border-slate-700">Plasman:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>1. mjesto (najbliži): <strong className="text-emerald-400">+3 boda</strong></li>
                <li>2. mjesto: <strong className="text-emerald-400">+1 bod</strong></li>
              </ul>

              <p className="text-sky-300 font-bold mt-2 pt-2 border-t border-slate-700">Bonusi:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Snajper (promašaj do 20): <strong className="text-emerald-400">+5 bodova</strong></li>
                <li>Oštro oko (promašaj do 100): <strong className="text-emerald-400">+2 boda</strong></li>
              </ul>

              <p className="text-red-300 font-bold mt-2 pt-2 border-t border-slate-700">Kazne:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Nedolazak (nisi igrao): <strong className="text-red-400">-2 boda</strong></li>
                <li>Zadnji na tablici (uz promašaj preko 800): <strong className="text-red-400">-1 bod</strong></li>
              </ul>

              <p className="text-amber-300 font-bold mt-2 pt-2 border-t border-slate-700">Džoker 🦈 (Sami protiv svih):</p>
              <p>Množi SVE tvoje bodove (i pluseve i minuse) s 2 u tom kolu!</p>
            </div>
            <button onClick={() => setPokaziPravila(false)} className="w-full mt-6 bg-sky-600 text-white font-bold py-2 rounded-xl hover:bg-sky-500">Razumijem!</button>
          </div>
        </div>
      )}

      <header className="mb-6 text-center mt-6 w-full max-w-md">
        <h1 className="text-4xl font-extrabold text-sky-400 mb-2 drop-shadow-md">Prorok Rujevice ⚪️🔵</h1>
        
        {/* NAVIGACIJA SA 3 TABA */}
        <div className="flex bg-slate-800 rounded-xl p-1 mt-6 border border-slate-700">
          <button onClick={() => setAktivniTab('unos')} className={`flex-1 py-2 rounded-lg font-bold transition-all text-sm sm:text-base ${aktivniTab === 'unos' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Aktivno</button>
          <button onClick={() => setAktivniTab('povijest')} className={`flex-1 py-2 rounded-lg font-bold transition-all text-sm sm:text-base ${aktivniTab === 'povijest' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Povijest</button>
          <button onClick={() => setAktivniTab('tablica')} className={`flex-1 py-2 rounded-lg font-bold transition-all text-sm sm:text-base ${aktivniTab === 'tablica' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Tablica</button>
        </div>
      </header>

      {/* VIEW: AKTIVNO KOLO */}
      {aktivniTab === 'unos' && (
        <div className="w-full flex flex-col items-center">
          {aktivnaUtakmica ? (
            <p className={`font-bold py-1 px-4 rounded-full inline-block mb-6 border ${aktivnaUtakmica.status === 'otvorena' ? 'text-white bg-sky-900/50 border-sky-700' : 'text-emerald-400 bg-emerald-900/50 border-emerald-700'}`}>
              ⚽ {aktivnaUtakmica.naziv} {aktivnaUtakmica.status === 'zavrsena' && '(ZAVRŠENO)'}
            </p>
          ) : <p className="text-slate-400 mb-6 border border-slate-700 bg-slate-800 px-4 py-2 rounded-full">Trenutno nema utakmica ⏳</p>}

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
                      {/* Otkrij Džokera tek kad je utakmica završena */}
                      {p.igraci?.ime} {aktivnaUtakmica?.status === 'zavrsena' && p.joker && <span className="ml-1">🦈</span>}
                    </div>
                    <div className="flex items-center gap-4">
                      
                      {/* LOGIKA SKRIVANJA PROGNOZA */}
                      {aktivnaUtakmica?.status === 'otvorena' ? (
                        <div className="text-emerald-400 font-bold text-sm tracking-wide flex items-center gap-2">
                           Prognoza spremljena <span className="text-xl">🔒</span>
                        </div>
                      ) : (
                        <>
                          <div className={`text-xl font-black ${p.napomena === 'Nije igrao' ? 'text-slate-500 text-sm' : 'text-white'}`}>
                            {p.napomena === 'Nije igrao' ? 'Nije igrao' : p.broj_gledatelja}
                          </div>
                          
                          <div className={`font-black text-xl w-8 text-center ${p.bodovi > 0 ? 'text-emerald-400' : p.bodovi < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                            {p.bodovi > 0 ? `+${p.bodovi}` : p.bodovi}
                          </div>
                        </>
                      )}

                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* NOVI I BOLJI GUMB ZA SPIKERA */}
          {aktivnaUtakmica?.status === 'otvorena' && (
            <button 
              onClick={() => setPokaziAdmin(!pokaziAdmin)} 
              className="text-slate-400 text-sm font-bold mt-8 bg-slate-800 hover:bg-slate-700 hover:text-white px-6 py-3 rounded-xl border border-slate-600 transition-all shadow-md"
            >
              ⚙️ SPIKER
            </button>
          )}

          {pokaziAdmin && aktivnaUtakmica?.status === 'otvorena' && (
            <div className="w-full max-w-md bg-amber-900/30 p-6 rounded-2xl border border-amber-700/50 mt-4">
              <h3 className="text-amber-500 font-bold mb-4 text-center">SPIKER TRIBINA</h3>
              <input type="number" className="w-full bg-slate-900 border border-amber-700/50 rounded-lg p-3 text-center text-white mb-4" placeholder="Službeni broj gledatelja..." value={sluzbeniBroj} onChange={(e) => setSluzbeniBroj(e.target.value)} />
              <button onClick={zavrsiUtakmicu} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl">PODIJELI BODOVE 🏆</button>
            </div>
          )}
        </div>
      )}

      {/* VIEW: POVIJEST KOLA */}
      {aktivniTab === 'povijest' && (
        <div className="w-full flex flex-col items-center">
          <div className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl border border-indigo-700/50 mb-6">
            <h2 className="text-2xl font-bold mb-4 text-center text-indigo-400 border-b border-slate-700 pb-4">Povijest Kola</h2>
            
            {zavrseneUtakmice.length === 0 ? (
              <p className="text-center text-slate-400 py-4">Još nema završenih utakmica.</p>
            ) : (
              <select 
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" 
                value={odabranaPovijestId} 
                onChange={(e) => setOdabranaPovijestId(e.target.value)}
              >
                <option value="">-- Odaberi utakmicu iz arhive --</option>
                {zavrseneUtakmice.map(u => (
                  <option key={u.id} value={u.id}>{u.naziv}</option>
                ))}
              </select>
            )}
          </div>

          {odabranaPovijestId && povijestPrognoze.length > 0 && (
            <section className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700 mb-6">
              {(() => {
                const odabranaObj = zavrseneUtakmice.find(u => u.id.toString() === odabranaPovijestId)
                return (
                  <h3 className="text-xl font-bold mb-4 text-center border-b border-slate-700 pb-2 text-indigo-400">
                    Službeni broj: {odabranaObj?.sluzbeni_broj}
                  </h3>
                )
              })()}
              
              <div className="space-y-3">
                {povijestPrognoze.map((p) => (
                  <div key={p.id} className="bg-slate-900 p-4 rounded-xl flex justify-between items-center border border-slate-700">
                    <div className="font-bold text-lg text-slate-300">
                      {p.igraci?.ime} {p.joker && <span className="ml-1">🦈</span>}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`text-xl font-black ${p.napomena === 'Nije igrao' ? 'text-slate-500 text-sm' : 'text-white'}`}>
                        {p.napomena === 'Nije igrao' ? 'Nije igrao' : p.broj_gledatelja}
                      </div>
                      <div className={`font-black text-xl w-8 text-center ${p.bodovi > 0 ? 'text-emerald-400' : p.bodovi < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                        {p.bodovi > 0 ? `+${p.bodovi}` : p.bodovi}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* VIEW: TABLICA */}
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