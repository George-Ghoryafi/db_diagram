export type CheckRule = { name: string; expression: string; fields: string[]; summary: string; options?: string[]; limits?: { label: string; maximum: string }[] };

// Read identifiers without mistaking strings, comments, functions or cast types for columns.
function sqlTokens(expression: string) {
  return [...expression.matchAll(/--[^\n]*|\/\*[\s\S]*?\*\/|\$(\w*)\$[\s\S]*?\$\1\$|'(?:''|[^'])*'|"(?:""|[^"])*"|[a-zA-Z_][\w$]*|\d+(?:\.\d+)?|::|>=|<=|<>|!=|[^\s]/g)].filter(token => !token[0].startsWith('--') && !token[0].startsWith('/*')).map(token => token[0]);
}
export function describeCheck(expression: string): Pick<CheckRule, 'summary' | 'options' | 'limits'> {
  const tokens = sqlTokens(expression);
  const simple = tokens.filter(token => token !== '(' && token !== ')').join(' ').replace(/ :: text\b/gi, '');
  let match = /^length ([\w]+) <= (\d+)$/i.exec(simple);
  if (match) return { summary: `At most ${Number(match[2]).toLocaleString('en-US')} characters` };
  match = /^([\w]+) >= (-?\d+(?:\.\d+)?) AND \1 <= (-?\d+(?:\.\d+)?)$/i.exec(simple);
  if (match) return { summary: `Between ${match[2]} and ${match[3]} (inclusive)` };
  match = /^([\w]+) (?:IN|= ANY ARRAY \[) (.+?)(?: \])?$/i.exec(simple);
  if (match && /^'(?:''|[^'])*'(?: , '(?:''|[^'])*')*$/.test(match[2])) return { summary: 'Allowed values', options: [...match[2].matchAll(/'((?:''|[^'])*)'/g)].map(value => value[1].replace(/''/g, "'")) };
  match = /^([\w]+) >= (\d+) AND \1 <= CASE ([\w]+) ((?:WHEN '(?:''|[^'])*' THEN \d+ )+)ELSE (\d+) END$/i.exec(simple);
  if (match) return { summary: `At least ${match[2]}; maximum depends on ${match[3]}`, limits: [...[...match[4].matchAll(/WHEN '((?:''|[^'])*)' THEN (\d+)/gi)].map(value => ({ label: value[1].replace(/''/g, "'"), maximum: value[2] })), { label: 'Other values', maximum: match[5] }] };
  return { summary: 'Custom SQL condition' };
}
export function checkRule(check: { name?: string; expression: string }, fieldNames: string[], column?: string): CheckRule {
  const tokens = sqlTokens(check.expression);
  const fields = fieldNames.filter(name => name === column || tokens.some((token, index) => {
    if (tokens[index - 1] === '::' || tokens[index + 1] === '(' || tokens[index + 1] === '.') return false;
    return token.startsWith('"') ? token.slice(1, -1).replace(/""/g, '"') === name : token.toLowerCase() === name.toLowerCase();
  }));
  return { name: check.name || '', expression: check.expression, fields, ...describeCheck(check.expression) };
}
