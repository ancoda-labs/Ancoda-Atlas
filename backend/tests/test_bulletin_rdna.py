"""RDNA table parsing from the bulletin damage page."""

from app.domains.flood.merge import rdna_totals_close
from app.domains.flood.sources.bulletin_damage import (
    parse_rdna_kpis,
    parse_rdna_table,
    rdna_table_html,
)

RDNA_SNIPPET = """
<section id="rdna">
  <div class="rdna-kpis">
    <div class="rdna-kpi"><span data-i18n="rdna_kpi_effects"></span>
      <strong class="num">४०,८२८.९१</strong><span class="cash-sub">USD २,६९५.३३ मिलियन</span></div>
    <div class="rdna-kpi"><span data-i18n="rdna_kpi_recovery"></span>
      <strong class="num">७२,३३१.५२</strong><span class="cash-sub">USD ४,७७४.९९ मिलियन</span></div>
    <div class="rdna-kpi"><span data-i18n="rdna_kpi_damage"></span><strong class="num">२७,४४८.३२</strong></div>
    <div class="rdna-kpi"><span data-i18n="rdna_kpi_loss"></span><strong class="num">१३,३८०.५८</strong></div>
  </div>
  <table class="plants rdna-tbl">
    <tr class="rdna-sec"><th data-i18n="rdna_sec_social_n">Social</th>
      <td>६,७८५.१०</td><td>२.००</td><td>६,७८७.१०</td><td>४४८.०५</td>
      <td>८२.८०</td><td>१०,२७२.१९</td><td>१०,३५४.९९</td><td>६८३.५९</td></tr>
    <tr><td data-i18n="rdna_sub_priv">Private</td>
      <td>६,३८८.४८</td><td>—</td><td>६,३८८.४८</td><td>४२१.७४</td>
      <td>४८</td><td>९,५३४.७२</td><td>९,५८२.७२</td><td>६३२.६१</td></tr>
    <tr><th data-i18n="rdna_total">Total</th>
      <td>२७,४४८.३२</td><td>१३,३८०.५८</td><td>४०,८२८.९१</td><td>२,६९५.३३</td>
      <td>८७३.५०</td><td>७१,४५८.०२</td><td>७२,३३१.५२</td><td>४,७७४.९९</td></tr>
  </table>
</section>
<section id="ems927"></section>
"""


class TestRdnaTable:
    def test_the_summary_table_is_found(self):
        assert rdna_table_html(RDNA_SNIPPET) is not None

    def test_headline_kpis_parse(self):
        kpis = parse_rdna_kpis(RDNA_SNIPPET)
        by_id = {k["id"]: k for k in kpis}
        assert by_id["effects"]["value_cr"] == 40828.91
        assert by_id["effects"]["usd_m"] == 2695.33
        assert by_id["damage"]["value_cr"] == 27448.32

    def test_sector_sub_and_total_rows_parse(self):
        rows = parse_rdna_table(RDNA_SNIPPET)
        by_id = {r["id"]: r for r in rows}
        assert by_id["social"]["effects_cr"] == 6787.10
        assert by_id["private-buildings"]["damage_cr"] == 6388.48
        assert by_id["total"]["recovery_cr"] == 72331.52

    def test_total_row_arithmetic_closes(self):
        rows = parse_rdna_table(RDNA_SNIPPET)
        assert rdna_totals_close(rows) is True
