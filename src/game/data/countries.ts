/**
 * src/game/data/countries.ts
 * Países / ligas disponibles + bancos de nombres para generación procedural.
 * IMPORTANTE: son nombres genéricos combinados aleatoriamente -> jugadores 100% ficticios.
 * No se usa ninguna base de datos de jugadores reales ni contenido con licencia.
 */

export interface CountryData {
  code: string;
  name: string;
  flag: string;
  leagueName: string;
  /** 1-100: fuerza futbolística del país (afecta nivel base y potenciales) */
  strength: number;
  first: string[];
  last: string[];
}

export const COUNTRIES: CountryData[] = [
  {
    code: "ESP",
    name: "España",
    flag: "🇪🇸",
    leagueName: "Liga Ibérica",
    strength: 92,
    first: ["Álvaro","Iker","Rubén","Sergio","Marcos","Adrián","Hugo","Nicolás","Javier","Pablo","Diego","Unai","Aitor","Gonzalo","Mateo","Rodrigo","Carlos","Iván","Bruno","Óscar","Jorge","Dani"],
    last: ["Arrieta","Vidal","Salazar","Peralta","Montoya","Cabrera","Quintana","Bermúdez","Escudero","Lozano","Ibáñez","Segura","Valcárcel","Ferrer","Gallardo","Rivas","Ordóñez","Padilla","Cardona","Rueda","Villena","Nadal"],
  },
  {
    code: "ARG",
    name: "Argentina",
    flag: "🇦🇷",
    leagueName: "Liga Rioplatense",
    strength: 90,
    first: ["Lautaro","Matías","Facundo","Tomás","Agustín","Franco","Joaquín","Nahuel","Emiliano","Santino","Thiago","Ramiro","Lucas","Ignacio","Julián","Benjamín","Gastón","Valentín","Bautista","Leandro"],
    last: ["Ferreyra","Bianchi","Solari","Ocampo","Barrios","Zabala","Maidana","Cardozo","Almirón","Villalba","Coronel","Ledesma","Insúa","Pignani","Rolón","Bustos","Aguirre","Ponzio","Cascini","Sanguinetti"],
  },
  {
    code: "CHI",
    name: "Chile",
    flag: "🇨🇱",
    leagueName: "Liga Andina",
    strength: 78,
    first: ["Matías","Vicente","Benjamín","Cristóbal","Ignacio","Bastián","Maximiliano","Sebastián","Felipe","Camilo","Renato","Gaspar","Emilio","Martín","Joaquín","Tomás","Agustín","Damián","Cristian","Nicolás","Esteban","Rodrigo"],
    last: ["Aravena","Sepúlveda","Fuentealba","Bascuñán","Mardones","Cárcamo","Zúñiga","Villagrán","Quintanilla","Alarcón","Millalén","Huenchul","Nahuelpán","Curihual","Antileo","Painén","Lagos","Riveros","Manríquez","Valdebenito","Cifuentes","Olivares"],
  },
  {
    code: "BRA",
    name: "Brasil",
    flag: "🇧🇷",
    leagueName: "Liga Verdeamarela",
    strength: 93,
    first: ["Vinícius","Kaio","Rafael","Wesley","Éverton","Gabriel","Lucas","Matheus","Danilo","Caio","Bruno","Igor","Talles","Yuri","Murilo","Otávio","Léo","Douglas","Vitor","Rodrigo"],
    last: ["Bragança","Sant'Anna","Ribeiro","Machado","Andrade","Cavalcanti","Barbosa","Teixeira","Nogueira","Bittencourt","Queiroz","Moraes","Rezende","Lacerda","Furtado","Peixoto","Assunção","Vasconcelos","Camargo","Siqueira"],
  },
  {
    code: "ENG",
    name: "Inglaterra",
    flag: "🇬🇧",
    leagueName: "Premier Islands League",
    strength: 91,
    first: ["Harvey","Callum","Reece","Kyle","Jude","Ollie","Mason","Tyler","Alfie","Elliot","Jamie","Connor","Ethan","Louis","Riley","Nathan","Ashley","Dominic","Freddie","Isaac"],
    last: ["Whitmore","Ashcroft","Braddock","Hollis","Nightingale","Kingsley","Fairbrother","Redfern","Blackwood","Marlowe","Pennington","Hartley","Sutcliffe","Ellery","Waverly","Thornton","Rushworth","Grimshaw","Alderton","Bexley"],
  },
  {
    code: "FRA",
    name: "Francia",
    flag: "🇫🇷",
    leagueName: "Ligue Hexagone",
    strength: 92,
    first: ["Enzo","Théo","Maël","Lucas","Nolan","Yanis","Ilan","Rayan","Baptiste","Corentin","Amaury","Léandre","Sacha","Gaël","Matis","Aurélien","Timothée","Élias","Kylian","Nathan"],
    last: ["Delacroix","Beaumont","Marchand","Lefevre","Chevalier","Dubreuil","Fontaine","Sauvage","Rochefort","Vaillant","Granger","Perrault","Lagarde","Mercier","Chastain","Duguay","Bonnaire","Vasseur","Clairmont","Aubert"],
  },
  {
    code: "GER",
    name: "Alemania",
    flag: "🇩🇪",
    leagueName: "Nordliga",
    strength: 90,
    first: ["Jonas","Lennart","Finn","Maximilian","Niklas","Tobias","Julian","Marvin","Fabian","Leon","Erik","Moritz","Sven","Kilian","Jannik","Malte","Til","Bennet","Ansgar","Rouven"],
    last: ["Brandtner","Kohlmann","Steinbach","Vogelsang","Reinhardt","Hartwig","Oberländer","Krüger","Naumann","Bergmann","Wielandt","Schuster","Falkenrath","Grunwald","Lindemann","Ostermann","Dietrich","Rothbauer","Ehrlich","Kaltenbrunn"],
  },
  {
    code: "ITA",
    name: "Italia",
    flag: "🇮🇹",
    leagueName: "Serie Tricolore",
    strength: 88,
    first: ["Alessio","Riccardo","Davide","Federico","Lorenzo","Simone","Tommaso","Giulio","Marco","Nicolò","Andrea","Cristian","Emanuele","Filippo","Gianluca","Leonardo","Matteo","Pietro","Samuele","Vincenzo"],
    last: ["Bergonzi","Fontanella","Marchetti","Cavalieri","Zaccaria","Rinaldi","Trevisan","Pellegrino","Sorrentino","Battistini","Lombardi","Corradini","Bevilacqua","Grimaldi","Manzoni","Ferraris","Serafini","Palumbo","Tarantino","Vanoli"],
  },
  {
    code: "POR",
    name: "Portugal",
    flag: "🇵🇹",
    leagueName: "Liga Atlântica",
    strength: 87,
    first: ["Rúben","Tomás","Gonçalo","Diogo","Afonso","Rodrigo","Duarte","Vasco","Miguel","Tiago","Nuno","Fábio","Salvador","Martim","Guilherme","Ivo","Simão","Hélder","Bernardo","Rui"],
    last: ["Coentrão","Salgueiro","Bandeira","Mendonça","Frazão","Abreu","Loureiro","Estrela","Carvalhal","Portela","Baptista","Seabra","Cardoso","Vilela","Trindade","Bragada","Anjos","Marinho","Correia","Espírito"],
  },
  {
    code: "NED",
    name: "Países Bajos",
    flag: "🇳🇱",
    leagueName: "Eredivisie Oranje",
    strength: 86,
    first: ["Sven","Daan","Bram","Joost","Ruben","Thijs","Stijn","Cas","Milan","Jurriën","Teun","Sem","Lars","Guus","Wout","Roan","Nout","Kjell","Mees","Ties"],
    last: ["van Dammen","Brouwer","Hulshof","van Nistel","Verhoeven","Kuipers","Bakhuys","de Ruiter","Vermeulen","Oosterhuis","van Aken","Slegers","Blankestijn","Terpstra","Wijnaldijk","Heemskerk","Boskamp","Rietveld","van Praag","Doedens"],
  },
  {
    code: "MEX",
    name: "México",
    flag: "🇲🇽",
    leagueName: "Liga Azteca",
    strength: 79,
    first: ["Emiliano","Santiago","Ángel","Ulises","Rodrigo","César","Iker","Erick","Alexis","Jesús","Marcelo","Damián","Kevin","Bryan","Fernando","Osvaldo","Ricardo","Aldo","Mauro","Israel","Cuauhtémoc","Ixtli","Rogelio","Efraín","Everardo","Leobardo"],
    last: ["Zaragoza","Ocaranza","Villalobos","Aceves","Barragán","Quiñones","Solís","Mondragón","Escalante","Tapia","Huerta","Camarena","Lizárraga","Nájera","Rentería","Cisneros","Ávalos","Beltrán","Corrales","Pedroza","Xochipa","Tenorio","Alcaraz","Berrelleza","Malacara","Zepeda","Iturbide","Cuellar"],
  },
  {
    code: "JPN",
    name: "Japón",
    flag: "🇯🇵",
    leagueName: "Sakura League",
    strength: 79,
    first: ["Haruto","Sota","Ren","Yuto","Kaito","Riku","Sora","Takumi","Daiki","Hinata","Kenta","Shota","Yamato","Itsuki","Ryusei","Kohei","Naoki","Tsubasa","Asahi","Reo"],
    last: ["Kurosawa","Mizuhara","Takeda","Nishimura","Hasegawa","Onodera","Kirishima","Amemiya","Shiraishi","Tatsumi","Fujisawa","Yamazato","Kanzaki","Morimoto","Sakuragi","Hoshino","Iwasaki","Ueshima","Nagatomo","Kirino"],
  },
  {
    code: "NGA",
    name: "Nigeria",
    flag: "🇳🇬",
    leagueName: "Savannah Premier",
    strength: 76,
    first: ["Chidi","Emeka","Tunde","Kelechi","Obinna","Ifeanyi","Segun","Bayo","Uche","Nnamdi","Femi","Chuka","Damola","Kayode","Sikiru","Ebuka","Yusuf","Olamide","Chinedu","Taiwo"],
    last: ["Adeyemi","Okonkwo","Balogun","Nwachukwu","Eze","Obi","Adebayo","Chukwu","Olawale","Ogunleye","Ibekwe","Danjuma","Onyeka","Afolabi","Mbakwe","Salami","Uzoma","Akinwale","Ekwueme","Bello"],
  },
];

export const COUNTRY_BY_CODE: Record<string, CountryData> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c])
);

export function countryName(code: string): string {
  return COUNTRY_BY_CODE[code]?.name ?? code;
}
export function countryFlag(code: string): string {
  return COUNTRY_BY_CODE[code]?.flag ?? "🏳️";
}
