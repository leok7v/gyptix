const ai = [
    "Can AI compose emotionally resonant music?",
    "Can AI solve the P vs NP problem?",
    "Can AI translators ever capture nuance?",
    "Can AI write better code than humans?",
    "How can AI enhance medical diagnostics?",
    "How can machine learning tackle poverty and inequality?",
    "How can we prevent algorithmic bias in AI systems?",
    "How do neural networks mimic biological brains?",
    "How will AI transform creative industries?",
    "Should AI have legal personhood?",
    "What are the existential risks of superintelligent AI?",
    "What ethical frameworks should guide AI decision-making?",
    "What safeguards prevent AI weaponization?",
    "Will AGI ever achieve human-like consciousness?",
    "Will AI make human labor obsolete?"
]

const art = [
    "Can AI-generated art be considered 'true' art?",
    "How do art movements reflect societal changes?",
    "How do museums influence art's perceived value?",
    "How has digital media transformed traditional art forms?",
    "Is art school necessary for artistic success?",
    "Is artistic value subjective or objective?",
    "What defines art in the modern era?",
    "What role does shock value play in contemporary art?",
    "What separates street art from vandalism?",
    "Why did abstract art emerge as a dominant form?",
    "Why do certain artworks become iconic (e.g., Mona Lisa)?",
    "Why do some artists gain fame posthumously (e.g., Van Gogh)?",
    "Can AI translate images into text?",
    "Can AI create portraits of real people?",
    "Can AI create music based on specific notes or scales?"
]

const astronomy = [
    "Can we harness zero-point energy?",
    "How do exoplanets challenge solar system models?",
    "How do galaxies collide without stellar collisions?",
    "How do pulsars act as cosmic lighthouses?",
    "How do solar winds affect Earth?",
    "How do telescopes peer back in time?",
    "What causes supernova explosions?",
    "What creates auroras on other planets?",
    "What defines a Goldilocks zone?",
    "What formed the Moon's craters?",
    "What mysteries does dark energy hold?",
    "Why are some moons geologically active?",
    "Why is dark matter undetectable?",
    "Why is Jupiter called Earth's 'shield'?"
]

const biology = [
    "How do epigenetics challenge Darwinian evolution?",
    "What drives the emergence of antibiotic-resistant bacteria?",
    "Can de-extinction efforts restore ecosystems?",
    "How do gut microbes influence mental health?",
    "What defines a species in hybrid zones?",
    "Why do some animals regenerate limbs while others can't?",
    "How does sexual selection drive biodiversity?",
    "What cellular mechanisms control aging?",
    "Can CRISPR eliminate genetic diseases?",
    "How do invasive species disrupt food chains?",
    "What triggers metamorphosis in insects?",
    "How do plants communicate chemically?",
    "Why do mitochondria have their own DNA?"
]

const books = [
    "Catcher in the Rye?",
    "Must read book list?",
    "Best children's books?",
    "What's Harry Potter about?",
    "Why is '1984' still relevant today?",
    "What makes 'To Kill a Mockingbird' timeless?",
    "Best fantasy novels of all time?",
    "What defines classic literature?",
    "Why do dystopian novels appeal to readers?",
    "What made 'Lord of the Rings' iconic?",
    "Why is Shakespeare still popular today?",
    "What drives the success of mystery novels?",
    "How have e-books changed reading habits?",
    "What’s 'Alice in Wonderland' about?",
    "Why is 'Hitchhiker’s Guide to the Galaxy' so loved?",
    "Best Terry Pratchett books to start with?",
    "What makes 'Good Omens' by Terry Pratchett special?",
    "Why is 'Discworld' by Terry Pratchett iconic?",
    "My child loves 'Lord of the Rings', what to read next?",
    "My child loves 'Harry Potter', what to read next?",
]

const business = [
    "What makes a startup succeed vs. fail?",
    "How important is company culture for growth?",
    "Should businesses prioritize profit or social good?",
    "What leadership styles drive innovation?",
    "How do global supply chains impact local economies?",
    "What ethical challenges arise in marketing?",
    "Can remote work sustain long-term productivity?",
    "How do monopolies stifle market competition?",
    "What strategies prevent employee burnout?",
    "How does branding influence consumer loyalty?",
    "What are the risks of rapid scaling?",
    "How can small businesses compete with giants?",
    "What role does data analytics play in decision-making?"
]

const crafting = [
    "What defines a 'handmade' item in the machine age?",
    "How does knitting improve mental focus?",
    "Why do DIY crafts reduce stress?",
    "What materials are best for eco-friendly crafts?",
    "How to upcycle household waste into art?",
    "What makes resin crafting hazardous?",
    "Why do quilting traditions vary culturally?",
    "How to preserve handmade paper?",
//  Next prompt is prone to repeatition penalty especially when
//  it has follow up "Generate much longer list." ...
//  "What safety precautions apply to woodworking?",
    "Why do embroidery patterns carry symbolism?",
    "How does candle-making balance art and science?",
    "What defines a 'maker' culture?",
    "Why are crafting communities thriving online?"
]

const chemistry = [
    "Why is water a universal solvent?",
    "How do catalysts lower activation energy?",
    "Can we create truly biodegradable plastics?",
    "What makes transition metals good catalysts?",
    "How do chiral molecules affect drug efficacy?",
    "Why does helium defy freezing at standard pressure?",
    "What causes luminescence in glow sticks?",
    "How do surfactants clean oil stains?",
    "Can alchemy concepts apply to modern chemistry?",
    "What makes graphene revolutionary?",
    "How do batteries degrade over time?",
    "Why are noble gases inert?",
    "What defines aromaticity in molecules?"
]

const cooking = [
    "What makes Maillard reactions crucial for flavor?",
    "How does sous-vide cooking enhance texture?",
    "Why do onions caramelize when heated?",
    "Can molecular gastronomy coexist with traditional cooking?",
    "What defines umami as a fifth taste?",
    "How does fermentation preserve foods?",
    "Why do baked goods rise unevenly?",
    "What makes sourdough fermentation unique?",
    "How do spices inhibit bacterial growth?",
    "Why does wine pairing enhance meals?",
    "What causes oil to smoke at high temps?",
    "How does cooking affect vitamin content?",
    "Why do chefs rest meat after cooking?",
    "What are the healthiest foods to eat if you're trying to lose weight?",
    "Can I use a pressure cooker instead of a stove to cook my meals?",
    "How can I make my dishes taste better without using any ingredients?"
]

const culture = [
    "How do clothing styles signal cultural status?",
    "How do festivals preserve heritage?",
    "How do languages encode cultural values?",
    "How do taboos define cultural identity?",
    "How does pop culture influence societal norms?",
    "What defines cultural appropriation?",
    "What makes a tradition resilient to globalization?",
    "What makes certain dances sacred?",
    "What role do elders play in cultural transmission?",
    "Why do culinary traditions resist change?",
    "Why do folk tales evolve over generations?",
    "Why do greetings vary globally?",
    "Why do superstitions persist scientifically?"
]

const economics = [
    "Can universal basic income work?",
    "How do subsidies distort markets?",
    "How does behavioral economics explain irrational spending?",
    "How does game theory apply to markets?",
    "What caused the Great Depression?",
    "What causes hyperinflation?",
    "What defines a post-scarcity economy?",
    "What defines a universal basic income's viability?",
    "What makes the gig economy unstable?",
    "Why are some nations resource-cursed?",
    "Why do black markets thrive?",
    "Why do cryptocurrencies challenge fiat systems?",
    "Why do economic bubbles burst?"
]

const education = [
    "Can journaling accelerate self-awareness?",
    "How does bilingual education benefit cognitive development?",
    "How effective is project-based learning?",
    "How important is early childhood education?",
    "How to address the digital divide in education?",
    "How to teach critical thinking effectively?",
    "Should education emphasize creativity over memorization?",
    "Should standardized testing be abolished?",
    "What makes a teacher truly impactful?",
    "What role should technology play in classrooms?",
    "What skills should modern education prioritize?",
    "What teaching methods maximize student engagement?",
    "What's the future of online learning platforms?"
]

const engineering = [
    "Can bioengineering create artificial organs?",
    "Can carbon capture reverse climate change?",
    "How do engineers combat urban heat islands?",
    "How do engineers earthquake-proof skyscrapers?",
    "How do microchips handle quantum tunneling effects?",
    "How to prevent corrosion in underwater structures?",
    "What caused the Tacoma Narrows Bridge collapse?",
    "What makes the Mars rover designs durable?",
    "What safety margins exist in airplane design?",
    "What's the future of self-healing materials?",
    "Why do dams require spillways?",
    "Why do some alloys have shape memory?",
    "Why do suspension bridges use cables instead of beams?",
    "How do engineers combat urban heat islands?",
    "How do engineers earthquake-proof skyscrapers?",
    "How do microchips handle quantum tunneling effects?",
    "How to prevent corrosion in underwater structures?",
    "What caused the Tacoma Narrows Bridge collapse?",
    "What makes the Mars rover designs durable?",
    "What safety margins exist in airplane design?",
    "How can nanotechnology enhance solar panels?",
    "Why are superconductors important for electrical grids?",
    "How does hydraulic fracturing (fracking) affect geological stability?",
    "What engineering challenges exist for fusion reactors?",
    "Why are carbon nanotubes so strong?",
    "How do engineers design efficient wind turbines?"
]

const entertainment = [
    "Best TV shows of the 21st century?",
    "Best movies of the 21st century?",
    "Most popular Rock'n'Roll bands?",
    "Why did 'Game of Thrones' gain such popularity?",
    "How has Netflix changed entertainment?",
    "Why is 'The Godfather' so influential?",
    "What defines the Golden Age of Television?",
    "Why are superhero movies so successful?",
    "How did reality TV change entertainment?",
    "What makes a film a 'cult classic'?",
    "Why do documentaries resonate with audiences?",
    "How has streaming impacted music sales?",
    "What’s behind the popularity of anime?"
]

const ethics = [
    "Can ethical frameworks keep pace with technological change?",
    "Do we have moral duties to future generations?",
    "How do cultural differences impact ethical standards?",
    "How should AI handle life-and-death decisions?",
    "Is ethical consumerism possible under capitalism?",
    "Is it ethical to prioritize family over strangers?",
    "Is lying ever morally justified?",
    "Is whistleblowing justified even if it harms others?",
    "Should animals have legal rights?",
    "What are the ethics of gene editing in humans?",
    "What defines human dignity in medical ethics?",
    "What ethical obligations do corporations have?",
    "What makes a war 'just' in modern times?"
]

const fiction = [
    "Can fan fiction be considered legitimate literature?",
    "Can fiction influence real-world social change?",
    "How do authors create believable fantasy worlds?",
    "How do writers balance plot and character development?",
    "How important is cultural accuracy in historical fiction?",
    "What defines a 'Mary Sue' character?",
    "What ethical lines exist in writing dark themes?",
    "What makes a plot twist truly satisfying?",
    "What makes a story timeless?",
    "What role does an unreliable narrator serve?",
    "Why do dystopian novels resonate with modern readers?",
    "Why do retellings of myths remain relevant?",
]

const finance = [
    "Can universal basic income work?",
    "How do hedge funds mitigate risk?",
    "How do interest rates affect economies?",
    "How does behavioral finance explain market irrationality?",
    "How important is financial literacy education?",
    "Is cryptocurrency a viable alternative currency?",
    "What are the ethics of short selling?",
    "What caused the 2008 financial crisis?",
    "What makes a recession inevitable?",
    "What principles guide value investing?",
    "What strategies prevent personal debt crises?",
    "What's the future of decentralized finance?",
    "Why does inflation impact wealth distribution?"
]

const fitness = [
    "Can yoga replace traditional cardio?",
    "How does aging affect workout routines?",
    "How does hydration impact performance?",
    "How does sleep affect recovery?",
    "How to avoid plateaus in training?",
    "What are the risks of overtraining?",
    "What defines functional fitness?",
    "What makes CrossFit controversial?",
    "What role does genetics play in bodybuilding?",
    "What workouts maximize fat loss vs. muscle gain?",
    "Why do fitness trackers motivate some and demotivate others?",
    "Why do fitness trends cycle (e.g., HIIT, Pilates)?",
    "Why do rest days prevent injury?"
]

const fun = [
    "Can humor be effectively translated across cultures?",
    "How do improv comedians think so quickly?",
    "How do pranks reveal human psychology?",
    "How does satire influence social commentary?",
    "What defines a perfect pun?",
    "What makes a joke universally funny?",
    "What makes a party game timeless?",
    "What's the science behind laughter?",
    "Why are escape rooms so addictive?",
    "Why do adults enjoy playgrounds secretly?",
    "Why do dad jokes remain cringey yet beloved?",
    "Why do funny cat videos dominate the internet?",
    "Why do memes spread faster than serious content?"
]

const gaming = [
    "Can gaming improve cognitive skills?",
    "How do esports rival traditional sports?",
    "How do games preserve cultural narratives?",
    "How do speedrunners break game physics?",
    "How does game design influence player behavior?",
    "How will VR/AR transform gaming?",
    "What defines a healthy gaming habit?",
    "What ethical issues surround loot boxes?",
    "What makes a video game addictive?", /* *** */
    "What makes open-world games immersive?",
    "What separates casual and hardcore gamers?",
    "Why do modding communities thrive?",
    "Why do retro games remain popular?"
]

const gardening = [
    "Can urban gardening solve food deserts?",
    "How do seasons dictate pruning schedules?",
    "How does soil pH affect plant growth?",
    "How does vertical gardening maximize space?",
    "How to create a pollinator-friendly garden?",
    "How to revive nutrient-depleted soil?",
    "What defines a successful crop rotation?",
    "What makes companion planting effective?",
    "What makes succulents drought-resistant?",
    "What pests can be controlled naturally?",
    "Why do compost teas boost soil health?",
    "Why do heirloom seeds matter?",
    "Why do some plants thrive in shade?",
    "How to grow herbs indoors without sunlight?",
    "What are the best plants for beginners in a pot?",
    "How to propagate rose bushes from cuttings?",
    "What are the best plants for a sunny patio?"
]

const geography = [
    "How do glaciers influence sea levels?",
    "How do human activities alter geography?",
    "How do rivers shape political boundaries?",
    "How do volcanoes create new land?",
    "How does altitude affect ecosystems?",
    "What causes monsoon seasons?",
    "What creates the Northern Lights' colors?",
    "What defines a 'country' geopolitically?",
    "What defines a biome's biodiversity?",
    "Why are some coastlines eroding faster?",
    "Why are some islands volcanic and others coral?",
    "Why do deserts form in specific latitudes?",
    "Why do tectonic plates move?"
]

const health = [
    "How can healthcare systems become more equitable?",
    "How do vaccines work at cellular level?",
    "How does aging affect cellular repair?",
    "How does gut microbiome affect overall health?",
    "How does sleep quality impact longevity?",
    "How does stress manifest physically?",
    "What are the ethics of genetic testing?",
    "What causes the rise in autoimmune diseases?",
    "What environmental factors damage health?",
    "What lifestyle changes prevent chronic diseases?",
    "What nutritional approaches optimize performance?",
    "What public policies improve population health?",
    "How effective are alternative medicines?"
]

const history = [
    "How accurate are historical records?",
    "How did colonialism shape modern economies?",
    "How did industrialization change families?",
    "How did the Black Death transform Europe?",
    "How did the Silk Road shape civilizations?",
    "What caused the Bronze Age Collapse?",
    "What drove the Age of Exploration?",
    "What factors cause societal collapse?",
    "What hidden patterns emerge in historical cycles?",
    "What if the Library of Alexandria survived?",
    "What lessons come from failed empires?",
    "Why did Soviet communism fail?",
    "Why did the Renaissance emerge in Italy?"
]

const hobbies = [
    "How do hobbies combat loneliness?",
    "How do hobbies reduce burnout?",
    "How to monetize a hobby ethically?",
    "How to start a hobby on a budget?",
    "What defines a 'guilty pleasure' hobby?",
    "What defines a hobby vs. a passion?",
    "What hobbies prepare kids for careers?",
    "What makes stamp collecting timeless?",
    "What risks accompany extreme hobbies?",
    "Why are vintage hobbies resurging?",
    "Why do adults revive childhood hobbies?",
    "Why do DIY hobbies foster creativity?",
    "Why do puzzle hobbies improve cognition?"
]

const homecare = [
    "How to fix a leaky faucet without tools?",
    "How to patch drywall holes seamlessly?",
    "How to silence squeaky floorboards?",
    "How to unclog drains naturally?",
    "How to winterize plumbing systems?",
    "What causes cracked tiles and how to replace them?",
    "What defines a safe DIY electrical repair?",
    "What safety gear is needed for roof repairs?",
    "What tools are essential for basic home repairs?",
    "Why do doors warp in humid climates?",
    "Why do gutters clog and how to prevent it?",
    "Why do HVAC filters need monthly changes?",
    "Why do paint colors fade over time?"
]

const housekeeping = [
    "How often should mattresses be replaced?",
    "How to deep-clean kitchen appliances?",
    "How to organize cluttered spaces effectively?",
    "How to prevent mold in bathrooms?",
    "How to safely dispose of expired medications?",
    "What cleaning products are eco-friendly?",
    "What defines a minimalist home?",
    "What laundry mistakes damage clothes?",
    "What makes microfiber cloths effective?",
    "Why are lemon and vinegar popular cleaners?",
    "Why do dust mites thrive in bedrooms?",
    "Why do odors linger in fabrics?",
    "Why do stainless steel appliances show fingerprints?"
]

const language = [
    "Can a dying language be revived effectively?",
    "Can AI translators ever capture nuance?",
    "How do constructed languages (e.g., Esperanto) succeed or fail?",
    "How do languages shape thought processes?",
    "How do slang terms enter formal speech?",
    "How does bilingualism affect brain structure?",
    "How does language influence cultural identity?",
    "What defines a language vs. a dialect?",
    "What makes certain accents harder to learn?",
    "What role do gestures play in communication?",
    "Why are some sounds present in all languages?",
    "Why do languages evolve over time?",
    "Why do some languages become dominant?"
]

const literature = [
    "Can poetry survive in the digital age?",
    "How do fan fiction expand canon?",
    "How do graphic novels elevate storytelling?",
    "How do translations alter literary meaning?",
    "How does magical realism reflect reality?",
    "How does satire critique society?",
    "What defines the 'hero's journey' archetype?",
    "What makes a mystery novel satisfying?",
    "What makes a protagonist unforgettable?",
    "What role do epigraphs play in novels?",
    "Why are banned books often influential?",
    "Why do authors use stream-of-consciousness?",
    "Why do classic novels remain relevant?"
]

const mathematics = [
    "Can all mathematical truths be proven?",
    "Can category theory unify mathematics?",
    "How does chaos theory apply to real systems?",
    "How does non-Euclidean geometry reshape reality?",
    "How do fractals model natural phenomena?",
    "What are computational mathematics' limits?",
    "What makes the Riemann Hypothesis important?",
    "What network insights come from graph theory?",
    "What's the significance of the Golden Ratio?",
    "What unsolved problems drive mathematical progress?",
    "Why are primes fundamental to cryptography?",
    "Why is mathematics discovered or invented?",
    "Will AI solve the P vs NP problem?"
]

const medicine = [
    "Can nanotechnology target cancer cells?",
    "How do mRNA vaccines work beyond COVID?",
    "How do placebos sometimes cure real conditions?",
    "How does anesthesia temporarily shut down consciousness?",
    "What breakthroughs could cure Alzheimer's?",
    "What caused the rise in antibiotic resistance?",
    "What ethical lines exist in human trials?",
    "What makes pain chronic in some patients?",
    "Why do autoimmune diseases disproportionately affect women?",
    "Why do prion diseases hijack proteins?",
    "Why do some viruses remain incurable?",
    "Will personalized medicine replace standard protocols?",
    "Should animal testing remain in medical research?"
]

const music = [
    "Can AI compose emotionally resonant music?",
    "How do cultural roots shape musical genres?",
    "How does music therapy affect mental health?",
    "How has streaming changed the music industry?",
    "What defines a musical genius?",
    "What makes a melody universally appealing?",
    "What separates pop from experimental music?",
    "Why are live performances irreplaceable?",
    "Why do certain songs trigger vivid memories?",
    "Why do earworms hijack our brains?",
    "Why do music tastes change with age?",
    "Why do people gravitate towards sad music?",
    "Why is classical music still relevant today?"
]

const mysteries = [
    "How did Stonehenge's builders align it astronomically?",
    "How did the Antikythera Mechanism function?",
    "How did the Mary Celeste become abandoned?",
    "What caused the Dyatlov Pass incident?",
    "What happened to Amelia Earhart?",
    "Why are Bermuda Triangle myths persistent?",
    "Why do Nazca Lines exist?",
    "Why do the Voynich Manuscript's symbols defy decoding?",
    "Why was Gobekli Tepe deliberately buried after construction?",
    "How was the Baghdad Battery used, and for what purpose?",
    "What caused the sudden collapse of the Bronze Age civilizations?",
    "Who built the ancient city of Teotihuacán, and why was it abandoned?",
    "Why did the Indus Valley civilization vanish without clear records?",
    "What exactly happened to the lost colony of Roanoke?",
    "How did ancient Egyptians drill perfectly precise holes in granite?",
    "What is the true origin and purpose of the underwater Yonaguni Monument?",
    "Why were the Longyou Caves carved out, with no historical records?",
    "Who created the giant stone spheres of Costa Rica, and why?",
    "What triggered the sudden disappearance of the Cahokia civilization?",
    "How did the ancient Egyptians produce Damascus steel, centuries ahead of Europe?",
    "Why did the Tunguska Event occur without a crater?"
]

const mythology = [
    "How do hero archetypes repeat globally?",
    "How do mythic monsters reflect societal fears?",
    "How do oral traditions preserve myths?",
    "What defines a trickster god?",
    "What lessons do fables encode?",
    "What myths explain astronomical events?",
    "What separates religion from mythology?",
    "Why are creation myths so diverse?",
    "Why do dragons appear in unrelated cultures?",
    "Why do flood myths span cultures?",
    "Why do modern stories reuse mythic themes?",
    "Why do underworld myths fascinate humans?",
    "How does mythology explain natural disasters?"
]

const parenting = [
    "How does screen time affect child development?",
    "How to balance discipline and empathy?",
    "How to discuss difficult topics with kids?",
    "How to foster independence in toddlers?",
    "How to teach financial literacy early?",
    "What defines authoritative vs. permissive parenting?",
    "What defines helicopter parenting?",
    "What makes Montessori education unique?",
    "What role do grandparents play in modern parenting?",
    "Why are teenage brains prone to risk-taking?",
    "Why do children develop imaginary friends?", /* *** */
    "Why do parenting styles vary culturally?",
    "Why do siblings develop rivalries?"
]

const pets = [
    "How do pets improve child development?",
    "How do pets reduce human stress?",
    "How to handle pet grief?",
    "How to interpret cat body language?",
    "How to train parrots to communicate?",
    "What are the risks of pet obesity?",
    "What defines ethical pet adoption?",
    "What ethical issues surround purebred breeding?",
    "What makes raw diets controversial for pets?",
    "Why are exotic pets problematic?",
    "Why do dogs bond deeply with humans?",
    "Why do fish tanks calm humans?",
    "Why do some pets develop anxiety?"
]

const philosophy = [
    "Can happiness be meaningfully measured?",
    "Does absolute truth exist?",
    "Does free will exist in a deterministic universe?",
    "Do we understand ourselves?",
    "Is human nature inherently good or evil?",
    "Is morality objective or subjective?",
    "What constitutes personal identity over time?",
    "What defines a just society?",
    "What is the meaning of life?",
    "What is the nature of consciousness?",
    "What is the relationship between mind and body?",
    "What is the ultimate purpose of human existence?",
    "Will religion ever die?",
    "What is Occam's Razor?",
    "What is Hanlon's Razor?",
    "Can complex systems be understood by breaking them into parts?",
    "Does the universe exist independently of our perception?",
    "Is knowledge justified true belief?",
    "Can something come from nothing?",
    "Do the ends justify the means?",
    "Is beauty in the eye of the beholder?",
    "Are we obligated to obey unjust laws?",
    "Can machines truly think?",
    "Is there a limit to human knowledge?",
    "Does every event have a cause?"
]

const physics = [
    "Can we harness zero-point energy?",
    "Could string theory ever be proven?",
    "How do magnets really work?",
    "How does quantum entanglement challenge relativity?",
    "How does quantum tunneling occur?",
    "How do superconductors defy resistance?",
    "What caused the asymmetry in matter/antimatter?",
    "What happens inside a black hole?",
    "What practical applications come from particle physics?",
    "What secrets do neutrino oscillations hold?",
    "Why does time dilate at high speeds?",
    "Why is the speed of light a cosmic limit?",
    "Will we ever unify all physics theories?",
    "How does gravity affect the behavior of subatomic particles?",
    "How does the theory of relativity affect our understanding of time and space?"
]

const productivity = [
    "How does digital minimalism increase efficiency?",
    "How does exercise improve cognitive output?",
    "How does the Pomodoro Technique boost focus?",
    "How to design a distraction-free workspace?",
    "How to prioritize tasks effectively?",
    "What defines 'deep work'?",
    "What habits waste the most time?",
    "What makes open-office plans counterproductive?",
    "What role does lighting play in productivity?",
    "Why do checklists prevent errors?",
    "Why do deadlines motivate procrastinators?",
    "Why do morning people outperform night owls?",
    "Why do multitaskers achieve less?"
]

const programming = [
    "Can AI write better code than humans?",
    "How do compilers transform human-readable code?",
    "How does functional programming differ from OOP?",
    "How important are coding standards in team projects?",
    "How important is algorithm optimization today?",
    "How will Web3 change software development?",
    "What are the limits of computational complexity?",
    "What makes a programming language 'good'?",
    "What paradigms will dominate future programming?",
    "What security practices prevent common vulnerabilities?",
    "What skills define a 10x developer?",
    "What's the future of quantum programming?",
    "Will low-code platforms replace traditional coding?"
]

const psychology = [
    "Can cognitive biases be overcome?",
    "How does childhood trauma affect adult relationships?",
    "How does color psychology impact behavior?",
    "How does groupthink influence decision-making?",
    "How does sleep deprivation affect mental health?",
    "How effective is talk therapy vs medication?",
    "Is nature or nurture more influential in development?",
    "What causes dissociative identity disorder?",
    "What causes Stockholm syndrome?",
    "What defines a psychopath vs. sociopath?",
    "What defines personality?",
    "What neural mechanisms drive addiction?",
    "Why do humans crave social validation?"
]

const robotics = [
    "How do robots assist in disaster zones?",
    "How do robots learn from simulations?",
    "How do robots mimic human dexterity?",
    "How do robots navigate unstructured environments?",
    "What defines a 'singularity' in AI?",
    "What ethical lines exist in military robotics?",
    "What jobs are safest from automation?",
    "What laws govern robotic rights?",
    "What prevents robots from true creativity?",
    "Why are robotic pets therapeutic?",
    "Why are swarm robots more efficient?",
    "Why do humanoid robots unsettle people?",
    "Why is soft robotics gaining traction?",
    "How to make a robot that can learn and adapt like a pet?",
    "Can a robot be programmed to understand and respond to emotions?",
    "What are the limits of human-robot collaboration?"
]

const science = [
    "Can we ever achieve room-temperature superconductivity?",
    "How do memories form and persist in the brain?",
    "How do placebo effects actually work?",
    "How will genetic engineering transform humanity?",
    "Is there life elsewhere in the universe?",
    "Is time-travel possible within the laws of current physics?",
    "What caused the Cambrian explosion of life?",
    "What is intelligence?",
    "What is quantum field theory?",
    "What is the difference between knowledge and intelligence?",
    "What mysteries does dark matter hold?",
    "What should we all do about climate change?",
    "Will fusion energy become commercially viable?"
]

const self_improvement = [
    "Can journaling accelerate self-awareness?",
    "How to balance ambition with contentment?",
    "How to break procrastination cycles?",
    "How to build habits that stick?",
    "How to overcome imposter syndrome?",
    "What defines a growth mindset?",
    "What defines toxic positivity?",
    "What makes SMART goals effective?",
    "What role does meditation play in focus?", /* *** */
    "Why do accountability partners work?",
    "Why do morning routines boost productivity?",
    "Why do people resist change despite wanting improvement?",
    "Why is failure critical to growth?"
]

const social_skills = [
    "Can charisma be learned?",
    "How to disagree without being confrontational?",
    "How to give constructive criticism?",
    "How to gracefully exit awkward conversations?",
    "How to read body language accurately?",
    "How to rebuild trust after conflict?",
    "How to set boundaries without offending?",
    "What defines emotional intelligence in practice?",
    "What makes active listening effective?",
    "What makes networking authentic vs. transactional?",
    "What role does humor play in bonding?",
    "Why do social interactions drain introverts?",
    "Why do some people dominate group discussions?"
]

const space = [
    "Can we ethically mine asteroids for resources?",
    "Does space colonization ensure humanity's survival?",
    "How can we protect astronauts from cosmic radiation?",
    "How does space research improve daily life on Earth?", /* *** */
    "How likely is extraterrestrial life in our solar system?",
    "How to address the growing problem of space debris?",
    "Should humans prioritize Mars colonization over Earth's issues?",
    "Should the Moon be a stepping stone for deeper space exploration?",
    "What did the Apollo missions teach us beyond science?",
    "What mysteries does dark energy hold?",
    "What role should private companies play in space ventures?",
    "Why is space exploration worth the financial cost?",
    "Will warp drive ever be theoretically feasible?"
]

const sports = [
    "How do sports injuries shorten careers?",
    "How do sports unite divided communities?", /* *** */
    "What defines a coach legendary?",
    "What defines a fair judging system?",
    "What genetic traits favor specific sports?",
    "What makes a sport Olympic-worthy?",
    "What technologies revolutionize training?",
    "Why are doping scandals so prevalent?",
    "Why are e-sports gaining legitimacy?",
    "Why do female athletes face pay disparities?",
    "Why do soccer/football dominate globally?",
]

const survival = [
    "How to build a debris hut in under an hour?",
    "How to craft a fish trap from natural materials?",
    "How to navigate without a compass?",
    "How to purify water using only natural materials?",
    "How to start a fire without matches?",
    "What knots are essential for wilderness survival?",
    "What plants are safe to eat in the wild?",
    "What signaling methods attract rescuers?",
    "Why do survival blankets retain 90% of body heat?",
    "Why do survivalists prioritize silence in the wild?",
    "Why does hypothermia kill faster than starvation?",
    "Why does the 'rule of threes' guide survival priorities?"
]

const technology = [
    "Can renewable energy completely replace fossil fuels?",
    "How can we ensure ethical technology development?",
    "How can we prevent technological unemployment?",
    "How is social media changing human cognition?",
    "How will 3D printing transform manufacturing?",
    "How will quantum computing revolutionize cryptography?",
    "Should there be global regulations for AI development?",
    "Should we geoengineer the climate?",
    "What are the risks of nanotechnology?",
    "What cybersecurity threats keep experts awake at night?",
    "What ethical boundaries should exist for genetic modification?",
    "What's the future of human-computer interfaces?",
    "Will brain-computer interfaces redefine humanity?"
]

const transportation = [
    "How do electric cars impact grid demand?",
    "How does ride-sharing affect traffic congestion?",
    "How to make freight shipping eco-friendly?",
    "How will drone deliveries reshape logistics?",
    "What hydrogen fuel challenges remain unsolved?",
    "What infrastructure supports flying cars?",
    "What makes autonomous vehicles safe?",
    "Why are bicycles gaining urban popularity?",
    "Why are micro-mobility scooters controversial?",
    "Why do high-speed rails succeed in some countries?",
    "Why do public transit systems struggle financially?",
    "Will hyperloop systems replace trains?",
    "Can we use AI to optimize traffic flow in real-time?"
]

const travel = [
    "How does slow travel reduce environmental impact?",
    "How has Airbnb disrupted traditional tourism?",
    "How to minimize jet lag effects?",
    "How to pack efficiently for long trips?",
    "How to travel ethically in indigenous areas?",
    "What cultural faux pas do tourists often commit?",
    "What defines voluntourism's ethical dilemmas?",
    "What makes solo travel transformative?",
    "What vaccines are essential for global travel?",
    "Why do language barriers enrich journeys?",
    "Why do travel diaries enhance experiences?",
    "Why do travel scams target foreigners?",
    "Why do 'hidden gem' destinations stay underrated?",
    "Can AI be used to create personalized travel itineraries?"
]

const writing = [
    "Can writing styles be copyrighted?",
    "How do cultural biases affect storytelling?",
    "How do translations alter literary meaning?",
    "How does censorship shape literature?",
    "How to overcome creative blocks?",
    "Is self-publishing disrupting traditional models?",
    "What defines 'purple prose'?",
    "What makes a first sentence unforgettable?",
    "What makes dialogue feel authentic?",
    "What role does editing play in quality?",
    "Why are writing prompts effective tools?",
    "Why do authors write pseudonymously?",
    "Why do certain genres dominate specific eras?",
    "Can AI be used to generate plot summaries for my writing?"
]

export const data = [
    { category: "AI",               prompts: ai               },
    { category: "Art",              prompts: art              },
    { category: "Astronomy",        prompts: astronomy        },
    { category: "Biology",          prompts: biology          },
    { category: "Books",            prompts: books            },
    { category: "Business",         prompts: business         },
    { category: "Chemistry",        prompts: chemistry        },
    { category: "Cooking",          prompts: cooking          },
    { category: "Crafting",         prompts: crafting         },
    { category: "Culture",          prompts: culture          },
    { category: "Economics",        prompts: economics        },
    { category: "Education",        prompts: education        },
    { category: "Engineering",      prompts: engineering      },
    { category: "Entertainment",    prompts: entertainment    },
    { category: "Ethics",           prompts: ethics           },
    { category: "Fiction",          prompts: fiction          },
    { category: "Finance",          prompts: finance          },
    { category: "Fitness",          prompts: fitness          },
    { category: "Fun",              prompts: fun              },
    { category: "Gaming",           prompts: gaming           },
    { category: "Gardening",        prompts: gardening        },
    { category: "Geography",        prompts: geography        },
    { category: "Health",           prompts: health           },
    { category: "History",          prompts: history          },
    { category: "Hobbies",          prompts: hobbies          },
    { category: "Homecare",         prompts: homecare         },
    { category: "Housekeeping",     prompts: housekeeping     },
    { category: "Language",         prompts: language         },
    { category: "Literature",       prompts: literature       },
    { category: "Mathematics",      prompts: mathematics      },
    { category: "Medicine",         prompts: medicine         },
    { category: "Music",            prompts: music            },
    { category: "Mysteries",        prompts: mysteries        },
    { category: "Mythology",        prompts: mythology        },
    { category: "Parenting",        prompts: parenting        },
    { category: "Pets",             prompts: pets             },
    { category: "Philosophy",       prompts: philosophy       },
    { category: "Physics",          prompts: physics          },
    { category: "Productivity",     prompts: productivity     },
    { category: "Programming",      prompts: programming      },
    { category: "Psychology",       prompts: psychology       },
    { category: "Robotics",         prompts: robotics         },
    { category: "Science",          prompts: science          },
    { category: "Self-Improvement", prompts: self_improvement },
    { category: "Social Skills",    prompts: social_skills    },
    { category: "Space",            prompts: space            },
    { category: "Sports",           prompts: sports           },
    { category: "Survival",         prompts: survival         },
    { category: "Technology",       prompts: technology       },
    { category: "Transportation",   prompts: transportation   },
    { category: "Travel",           prompts: travel           },
    { category: "Writing",          prompts: writing          }
]
