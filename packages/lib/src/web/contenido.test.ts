/**
 * Pruebas del contenido editable de la web.
 *
 * Lo que se protege acá es que la tienda NUNCA quede en blanco. Quien edita
 * desde el ERP puede borrar un campo, pegar un teléfono con espacios o dejar
 * un slide sin foto; nada de eso puede terminar en una portada rota, porque la
 * ve un cliente que está por comprar.
 */

import { describe, it, expect } from 'vitest';
import {
  contenidoDesdeFilas,
  soloDigitos,
  enlaceWhatsApp,
  telefonoLegible,
  CONTENIDO_POR_DEFECTO,
} from './contenido';

describe('cuando la base no trae nada', () => {
  it('sin filas, la web sale con lo que ya estaba publicado', () => {
    const c = contenidoDesdeFilas([]);
    expect(c.hero_slides.length).toBeGreaterThan(0);
    expect(c.cta_mayorista.titulo).toBe(CONTENIDO_POR_DEFECTO.cta_mayorista.titulo);
    expect(c.contacto.whatsapp).toBe('51903064120');
  });

  it('con null tampoco se cae', () => {
    expect(contenidoDesdeFilas(null).hero_slides.length).toBeGreaterThan(0);
  });

  it('una clave rota no se lleva puestas a las demás', () => {
    // El slider mal cargado, pero el pie de página tiene que seguir bien.
    const c = contenidoDesdeFilas([
      { clave: 'hero_slides', valor: 'esto no es una lista' },
      { clave: 'contacto', valor: { whatsapp: '51999888777', email: 'hola@happys.pe' } },
    ]);
    expect(c.hero_slides.length).toBeGreaterThan(0);   // cae al valor por defecto
    expect(c.contacto.whatsapp).toBe('51999888777');   // y este se respeta
    expect(c.contacto.email).toBe('hola@happys.pe');
  });
});

describe('los slides del carrusel', () => {
  it('toma los que se cargaron, en orden', () => {
    const c = contenidoDesdeFilas([{
      clave: 'hero_slides',
      valor: [
        { imagen_url: '/halloween1.webp', titulo: 'Halloween', href: '/campanias/halloween' },
        { imagen_url: '/halloween2.webp', titulo: 'Terror' },
      ],
    }]);
    expect(c.hero_slides.length).toBe(2);
    expect(c.hero_slides[0]!.titulo).toBe('Halloween');
    expect(c.hero_slides[1]!.imagen_url).toBe('/halloween2.webp');
  });

  it('un slide sin imagen se descarta, no deja una franja vacía', () => {
    const c = contenidoDesdeFilas([{
      clave: 'hero_slides',
      valor: [
        { imagen_url: '/ok.webp', titulo: 'Bien' },
        { titulo: 'Sin foto' },
        { imagen_url: '   ', titulo: 'Espacios' },
      ],
    }]);
    expect(c.hero_slides.length).toBe(1);
    expect(c.hero_slides[0]!.titulo).toBe('Bien');
  });

  it('si TODOS los slides están rotos, vuelve a lo publicado', () => {
    // Una portada sin carrusel es una página que arranca en blanco.
    const c = contenidoDesdeFilas([{ clave: 'hero_slides', valor: [{ titulo: 'sin foto' }] }]);
    expect(c.hero_slides).toEqual(CONTENIDO_POR_DEFECTO.hero_slides);
  });

  it('un layout inventado no rompe el diseño', () => {
    const c = contenidoDesdeFilas([{
      clave: 'hero_slides',
      valor: [{ imagen_url: '/a.webp', layout: 'diagonal-invertido', badge: 'calabaza' }],
    }]);
    expect(c.hero_slides[0]!.layout).toBe('centro');
    expect(c.hero_slides[0]!.badge).toBe('sparkle');
  });

  it('la animación se puede vaciar al cambiar de campaña', () => {
    // Los corazones de mayo en un slide de Halloween se ven peor que nada.
    const c = contenidoDesdeFilas([{
      clave: 'hero_slides',
      valor: [{ imagen_url: '/hw.webp', lottie_url: '' }],
    }]);
    expect(c.hero_slides[0]!.lottie_url).toBe('');
  });
});

describe('los teléfonos', () => {
  it('acepta el número escrito como sea', () => {
    expect(soloDigitos('+51 903 064 120')).toBe('51903064120');
    expect(soloDigitos('903-064-120')).toBe('903064120');
    expect(soloDigitos('(51) 903 064 120')).toBe('51903064120');
  });

  it('el enlace de WhatsApp queda utilizable', () => {
    // Con un espacio adentro, wa.me abre un chat vacío.
    expect(enlaceWhatsApp('+51 903 064 120')).toBe('https://wa.me/51903064120');
  });

  it('el saludo viaja codificado', () => {
    const url = enlaceWhatsApp('51903064120', 'Hola! Quiero consultar por disfraces');
    expect(url).toContain('?text=Hola');
    expect(url).not.toContain(' ');
  });

  it('sin número, el enlace no lleva a un chat roto', () => {
    expect(enlaceWhatsApp('')).toBe('#');
    expect(enlaceWhatsApp('sin numero')).toBe('#');
  });

  it('el número se muestra legible', () => {
    expect(telefonoLegible('51903064120')).toBe('+51 903 064 120');
    expect(telefonoLegible('')).toBe('');
  });

  it('el teléfono guardado con espacios se normaliza al leerlo', () => {
    const c = contenidoDesdeFilas([{ clave: 'contacto', valor: { whatsapp: '+51 999 888 777' } }]);
    expect(c.contacto.whatsapp).toBe('51999888777');
  });
});

describe('las redes', () => {
  it('una red vacía queda vacía: no se inventa un enlace', () => {
    // Un ícono que lleva a ningún lado es peor que no mostrar el ícono.
    const c = contenidoDesdeFilas([{ clave: 'redes', valor: { facebook: 'https://fb.com/happys' } }]);
    expect(c.redes.facebook).toBe('https://fb.com/happys');
    expect(c.redes.tiktok).toBe('');
    expect(c.redes.instagram).toBe('');
  });
});
