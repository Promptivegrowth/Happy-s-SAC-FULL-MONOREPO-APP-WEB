/**
 * Estructura del megamenú principal del header.
 * Cada grupo de navegación tiene columnas; cada columna es una sub-categoría
 * con un título (link a /categoria/[slug]) y ejemplos para SEO.
 *
 * Slugs deben coincidir con la columna `categorias.slug` en BD.
 * El query ?genero=NINO/NINA/ADULTO es filtro funcional en la página.
 */

export type MegaColumna = {
  titulo: string;
  href: string;
  icono: string;
  examples: string[];
};

export type MegaItem =
  | {
      kind: 'mega';
      label: string;
      href: string;
      hot?: boolean;
      columns: MegaColumna[];
    }
  | {
      kind: 'dropdown';
      label: string;
      href: string;
      hot?: boolean;
      links: { label: string; href: string }[];
    }
  | {
      kind: 'link';
      label: string;
      href: string;
      hot?: boolean;
    };

export const MEGA_MENU: MegaItem[] = [
  { kind: 'link', label: 'Home', href: '/' },

  {
    kind: 'mega',
    label: 'Disfraces de niño',
    href: '/disfraces/ninos',
    columns: [
      {
        titulo: 'Superhéroes económicos',
        href: '/categoria/superheroes-economicos?genero=NINO',
        icono: '🦸',
        examples: ['Spiderman', 'Ironman', 'Superman', 'Batman', 'Capitán América', 'Venom', 'Flash'],
      },
      {
        titulo: 'Superhéroes especiales',
        href: '/categoria/superheroes-especiales?genero=NINO',
        icono: '⭐',
        examples: ['Spiderman', 'Ironman', 'Superman', 'Sonic', 'Goku', 'Venom', 'Capitán América', 'Flash'],
      },
      {
        titulo: 'Superhéroes sublimados',
        href: '/categoria/superheroes-sublimados?genero=NINO',
        icono: '🌈',
        examples: ['Spiderman', 'Batman', 'Superman', 'Hulk', 'Capitán América'],
      },
      {
        titulo: 'Profesiones',
        href: '/categoria/profesiones?genero=NINO',
        icono: '👷',
        examples: ['Bombero', 'Policía niño', 'Cruz roja', 'Enfermero', 'Comando con polo'],
      },
      {
        titulo: 'Danzas típicas',
        href: '/categoria/danzas-tipicas?genero=NINO',
        icono: '💃',
        examples: ['Festejo', 'Negroide', 'Chala', 'Carnaval arequipeño', 'Balicha', 'Shipibo', 'Huaylas'],
      },
      {
        titulo: 'Fiestas Patrias',
        href: '/categoria/fiestas-patrias?genero=NINO',
        icono: '🇵🇪',
        examples: ['Bolívar', 'San Martín', 'Chalaco', 'Husar', 'Conquistador', 'Túpac Amaru'],
      },
      {
        titulo: 'Personajes',
        href: '/categoria/personajes-varios?genero=NINO',
        icono: '🎭',
        examples: ['Mario Bros', 'Luigi', 'Piloto', 'Cars', 'Pocoyó', 'Quico', 'Chavo', 'Chapulín'],
      },
      {
        titulo: 'Halloween',
        href: '/categoria/halloween?genero=NINO',
        icono: '🎃',
        examples: ['Chuky', 'Juego del calamar', 'Wasson', 'Mavis', 'Tifany', 'Harley Quinn', 'Maléfica', 'Huérfana', 'Merlina'],
      },
      {
        titulo: 'Primavera',
        href: '/categoria/primavera?genero=NINO',
        icono: '🌸',
        examples: ['Abejorro', 'Flores', 'Mariposa', 'Conejos', 'Hadas', 'Mariquitas'],
      },
      {
        titulo: 'Talleres de verano',
        href: '/categoria/talleres-de-verano?genero=NINO',
        icono: '☀️',
        examples: ['Marinera', 'Alegría', 'Camisones', 'Pijamas'],
      },
    ],
  },

  {
    kind: 'mega',
    label: 'Disfraces niñas',
    href: '/disfraces/ninas',
    columns: [
      {
        titulo: 'Princesas Disney',
        href: '/categoria/princesas-especiales?genero=NINA',
        icono: '👸',
        examples: ['Blanca Nieves', 'Rapunzel', 'Frozen II', 'Jazmín', 'Sirenita', 'Bella', 'Aurora'],
      },
      {
        titulo: 'Superheroínas',
        href: '/categoria/superheroinas?genero=NINA',
        icono: '🦸‍♀️',
        examples: ['Mujer Maravilla', 'Batichica', 'Mujer Araña', 'Capitana Marvel', 'Supergirl'],
      },
      {
        titulo: 'Personajes',
        href: '/categoria/personajes-varios?genero=NINA',
        icono: '🎭',
        examples: ['Pitufina', 'Minnie', 'Lulú', 'Dora exploradora', 'Lady Bug', 'Chilindrina'],
      },
      {
        titulo: 'Profesiones',
        href: '/categoria/profesiones?genero=NINA',
        icono: '👩‍⚕️',
        examples: ['Bombera', 'Policía niña', 'Doctora', 'Enfermera', 'Obstetra', 'Chef'],
      },
      {
        titulo: 'Halloween',
        href: '/categoria/halloween?genero=NINA',
        icono: '🎃',
        examples: ['Mavis', 'Tifany', 'Harley Quinn', 'Maléfica', 'Huérfana', 'Merlina'],
      },
      {
        titulo: 'Primavera',
        href: '/categoria/primavera?genero=NINA',
        icono: '🌸',
        examples: ['Mariposas body', 'Mariposas vestido', 'Flores', 'Girasoles', 'Abejitas', 'Mariquitas'],
      },
      {
        titulo: 'Danzas típicas',
        href: '/categoria/danzas-tipicas?genero=NINA',
        icono: '💃',
        examples: ['Festejo', 'Negroide', 'Chala', 'Carnaval arequipeño', 'Balicha', 'Shipibo', 'Huaylas'],
      },
      {
        titulo: 'Fiestas Patrias',
        href: '/categoria/fiestas-patrias?genero=NINA',
        icono: '🇵🇪',
        examples: ['Micaela Bastidas', 'Marinera', 'Selva mujer', 'China Tapada', 'Pallas'],
      },
      {
        titulo: 'Semana Santa',
        href: '/categoria/semana-santa?genero=NINA',
        icono: '✝️',
        examples: ['Angelitos', 'Virgen', 'Pastorcita'],
      },
    ],
  },

  {
    kind: 'mega',
    label: 'Disfraces de adultos',
    href: '/disfraces/adultos',
    columns: [
      {
        titulo: 'Superhéroes',
        href: '/categoria/superheroes-especiales?genero=ADULTO',
        icono: '🦸',
        examples: ['Spiderman', 'Superman', 'Capitán América', 'Batman', 'Hulk', 'Mujer Maravilla'],
      },
      {
        titulo: 'Halloween',
        href: '/categoria/halloween?genero=ADULTO',
        icono: '🎃',
        examples: ['Chuky', 'Juego del calamar', 'Wasson', 'Drácula', 'Bruja', 'Maléfica'],
      },
      {
        titulo: 'Navidad',
        href: '/categoria/navidad?genero=ADULTO',
        icono: '🎅',
        examples: ['Mamá Noela', 'Papá Noel', 'Duendes', 'Renos', 'José', 'Jesús', 'María', 'Reyes Magos'],
      },
      {
        titulo: 'Danzas típicas',
        href: '/categoria/danzas-tipicas?genero=ADULTO',
        icono: '💃',
        examples: ['Festejo', 'Negroide', 'Chala', 'Carnaval arequipeño', 'Balicha', 'Shipibo', 'Huaylas'],
      },
      {
        titulo: 'Fiestas Patrias',
        href: '/categoria/fiestas-patrias?genero=ADULTO',
        icono: '🇵🇪',
        examples: ['Bolívar', 'San Martín', 'Marina de Gala', 'Conquistador', 'Húsares'],
      },
      {
        titulo: 'Semana Santa',
        href: '/categoria/semana-santa?genero=ADULTO',
        icono: '✝️',
        examples: ['Túnica', 'Romano', 'Apóstoles', 'María Magdalena'],
      },
      {
        titulo: 'Profesiones',
        href: '/categoria/profesiones?genero=ADULTO',
        icono: '👩‍⚕️',
        examples: ['Doctor', 'Doctora', 'Enfermera', 'Policía', 'Bombero', 'Chef'],
      },
      {
        titulo: 'Personajes',
        href: '/categoria/personajes-varios?genero=ADULTO',
        icono: '🎭',
        examples: ['Mickey', 'Minnie', 'Animadoras', 'Bailarinas', 'Payasos', 'Mascotas'],
      },
    ],
  },

  {
    kind: 'dropdown',
    label: 'Accesorios',
    href: '/categoria/accesorios',
    links: [
      { label: 'Ver todos los accesorios', href: '/categoria/accesorios' },
      { label: 'Coronas', href: '/categoria/accesorios?q=corona' },
      { label: 'Vinchas', href: '/categoria/accesorios?q=vincha' },
      { label: 'Pelucas', href: '/categoria/accesorios?q=peluca' },
      { label: 'Alitas', href: '/categoria/accesorios?q=ala' },
      { label: 'Capas', href: '/categoria/accesorios?q=capa' },
      { label: 'Máscaras', href: '/categoria/accesorios?q=mascara' },
    ],
  },

  {
    kind: 'link',
    label: 'Día de la Madre 2026',
    href: '/campanias/dia-de-la-madre-2026',
    hot: true,
  },

  { kind: 'link', label: 'Contacto', href: '/contacto' },
];
