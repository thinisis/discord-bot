import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../shared/cli-ui/src/components/ui/Button';
import { Input } from '../shared/cli-ui/src/components/ui/Input';
import { Card } from '../shared/cli-ui/src/components/ui/Card';
describe('shared CLI components', () => {
  test('busy buttons prevent duplicate submission and expose their label', () => {
    const html = renderToStaticMarkup(
      <Button loading type="submit">
        Lưu thay đổi
      </Button>
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('Lưu thay đổi');
    expect(html).toContain('loading-spinner');
  });
  test('input labels, validation and hints remain associated for assistive technology', () => {
    const html = renderToStaticMarkup(
      <Input id="owner" label="Owner ID" hint="Mỗi ID một dòng" error="ID không hợp lệ" />
    );
    expect(html).toContain('for="owner"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="owner-error owner-hint"');
    expect(html).toContain('id="owner-error"');
    expect(html).toContain('id="owner-hint"');
  });
  test('card content and API-derived text are safely escaped', () => {
    const html = renderToStaticMarkup(
      <Card title="Máy chủ">
        <span>{'<img src=x onerror=alert(1)>'}</span>
      </Card>
    );
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
  });
});
