import fs from 'fs';
import path from 'path';

const files = [
    'src/scenes/Cosmos.jsx',
    'src/scenes/MicroCosmos.jsx',
    'src/scenes/Planet.jsx',
    'src/scenes/BigBang.jsx'
];

files.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    content = content.replace(/<Text\s([^>]+)>/g, (match, p1) => {
        if (p1.includes('font=')) return match;
        changed = true;
        return '<Text font="/Roboto-Regular.ttf" ' + p1 + '>';
    });

    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log('Updated', file);
    }
});
